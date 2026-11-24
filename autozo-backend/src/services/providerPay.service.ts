import { Types } from 'mongoose';
import { pendingManualTotal } from './manualPending';
import { ProviderTxn } from '../models/ProviderTxn';
import { User } from '../models/User';
import { ApiError } from '../utils/ApiError';
import { loadSettings } from './settings.service';
import { createUserPayout, fetchPayoutStatus, payoutSettlement, razorpayxConfig } from './razorpayx.service';

type PaySettings = { providerPay?: { commissionPct?: number; minWithdraw?: number; dueLimit?: number } };

const round = (n: number) => Math.round(n * 100) / 100;
const oid = (v: Types.ObjectId | string) => new Types.ObjectId(String(v));

/** The provider money rules from settings, with safe defaults. */
export function providerPayRules(settings: PaySettings) {
  const p = settings.providerPay ?? {};
  const pct = typeof p.commissionPct === 'number' && p.commissionPct >= 0 && p.commissionPct <= 100 ? p.commissionPct : 10;
  return {
    commissionPct: pct,
    minWithdraw: typeof p.minWithdraw === 'number' && p.minWithdraw >= 0 ? p.minWithdraw : 200,
    dueLimit: typeof p.dueLimit === 'number' && p.dueLimit >= 0 ? p.dueLimit : 0,
  };
}

/** A running plan means no commission; without one the platform keeps `commissionPct`. */
export function hasRunningPlan(user: { subscriptionUntil?: Date | null } | null | undefined): boolean {
  return !!user?.subscriptionUntil && new Date(user.subscriptionUntil).getTime() > Date.now();
}

/** Added to provider queries that pick who may get new bookings: unpaid commission within the limit. */
export async function providerDueFilter() {
  const { settings } = await loadSettings();
  const { dueLimit } = providerPayRules(settings);
  return { $or: [{ providerDue: { $exists: false } }, { providerDue: { $lte: dueLimit } }] };
}

/** A provider's wallet at a glance. */
export async function providerWalletSummary(providerId: Types.ObjectId | string) {
  const manualPending = await pendingManualTotal(providerId, 'provider_dues');
  const rows = await ProviderTxn.aggregate<{ _id: { kind: string; status: string; method?: string }; total: number; commission: number }>([
    { $match: { provider: oid(providerId) } },
    {
      $group: {
        _id: { kind: '$kind', status: '$status', method: '$method' },
        total: { $sum: '$amount' },
        commission: { $sum: { $ifNull: ['$commission', 0] } },
      },
    },
  ]);
  let credit = 0; // online earnings + admin credits
  let onlineCommission = 0; // commission already taken out of online earnings
  let duesOwed = 0; // commission on cash bookings
  let duesPaid = 0; // confirmed dues payments
  let duesPending = 0; // dues payments waiting for the office
  let walletSpent = 0; // dues paid from the wallet
  let pendingWithdraw = 0;
  let paidOut = 0;
  for (const r of rows) {
    const { kind, status, method } = r._id;
    if (kind === 'earning') { credit += r.total; onlineCommission += r.commission; }
    else if (kind === 'adjustment') credit += r.total;
    else if (kind === 'commission') duesOwed += r.total;
    else if (kind === 'commission_paid') {
      if (status === 'confirmed') { duesPaid += r.total; if (method === 'wallet') walletSpent += r.total; }
      else if (status === 'pending') duesPending += r.total;
    } else if (kind === 'withdrawal') {
      if (status === 'pending') pendingWithdraw += r.total;
      else if (status === 'paid') paidOut += r.total;
    }
  }
  return {
    balance: round(Math.max(0, credit - walletSpent - pendingWithdraw - paidOut)),
    onlineEarned: round(credit),
    commissionTotal: round(onlineCommission + duesOwed),
    due: round(Math.max(0, duesOwed - duesPaid)),
    duePending: round(duesPending + manualPending),
    pendingWithdraw: round(pendingWithdraw),
    paidOut: round(paidOut),
  };
}

/** Re-count the provider's unpaid commission from the ledger and store it on the user (used to gate new bookings). */
export async function refreshProviderDue(providerId: Types.ObjectId | string): Promise<number> {
  const { due } = await providerWalletSummary(providerId);
  await User.updateOne({ _id: providerId }, { $set: { providerDue: due } });
  return due;
}

/** True when the provider owes more commission than allowed and must clear it before new bookings. */
export async function providerBlockedByDues(providerId: Types.ObjectId | string): Promise<{ blocked: boolean; due: number; dueLimit: number }> {
  const [{ settings }, me] = await Promise.all([loadSettings(), User.findById(providerId).select('providerDue').lean()]);
  const { dueLimit } = providerPayRules(settings);
  const due = me?.providerDue ?? 0;
  return { blocked: due > dueLimit, due, dueLimit };
}

/**
 * Settle a completed booking into the provider's wallet. Online: the platform
 * holds the money, so the provider's share is credited. Cash: the provider
 * holds it, so the commission (if any) becomes a due. Returns the commission
 * and the provider's share. Idempotent per booking.
 */
export async function settleCompletedBooking(booking: {
  _id: Types.ObjectId; provider?: Types.ObjectId | null; bookingNumber: string; price: number;
  paymentMethod: 'cod' | 'online'; paymentStatus?: string;
}): Promise<{ commission: number; earning: number }> {
  if (!booking.provider) return { commission: 0, earning: booking.price };
  const [{ settings }, provider] = await Promise.all([loadSettings(), User.findById(booking.provider).select('subscriptionUntil').lean()]);
  const pct = hasRunningPlan(provider) ? 0 : providerPayRules(settings).commissionPct;
  const commission = round((booking.price * pct) / 100);
  const earning = round(booking.price - commission);
  const base = { provider: booking.provider, booking: booking._id, bookingNumber: booking.bookingNumber, gross: booking.price, commission, commissionPct: pct };
  try {
    if (booking.paymentMethod === 'online' && booking.paymentStatus === 'paid') {
      await ProviderTxn.create({ ...base, kind: 'earning', amount: earning, status: 'completed', paymentMethod: 'online', note: `Booking ${booking.bookingNumber} (paid online)` });
    } else if (booking.paymentMethod === 'cod' && commission > 0) {
      await ProviderTxn.create({ ...base, kind: 'commission', amount: commission, status: 'completed', paymentMethod: 'cod', note: `${pct}% commission on cash booking ${booking.bookingNumber}` });
      await refreshProviderDue(booking.provider);
    }
  } catch (e) {
    if ((e as { code?: number }).code !== 11000) throw e; // already settled
  }
  return { commission, earning };
}

/** Create a RazorpayX payout for a provider's pending withdrawal. */
export async function payProviderWithdrawal(txnId: string | Types.ObjectId): Promise<void> {
  const cfg = await razorpayxConfig();
  if (!cfg) throw new ApiError(400, 'RazorpayX payouts are not switched on.');
  const txn = await ProviderTxn.findOne({ _id: txnId, kind: 'withdrawal' });
  if (!txn) throw new ApiError(404, 'Withdrawal not found');
  if (txn.status !== 'pending') throw new ApiError(409, 'This withdrawal was already handled.');
  if (txn.payoutId) throw new ApiError(409, 'A payout was already started for this withdrawal.');
  const method = txn.method === 'bank' ? 'bank' : 'upi';
  const { payoutId, status } = await createUserPayout(txn.provider, txn.amount, method, String(txn._id), 'autozo provider payout');
  txn.payoutId = payoutId;
  txn.payoutStatus = status;
  txn.reference = payoutId;
  const settled = payoutSettlement(status);
  if (settled) txn.status = settled;
  txn.note = `RazorpayX payout ${status}`;
  await txn.save();
}

/** Refresh an in-flight provider payout and settle it if it finished. */
export async function syncProviderPayout(txnId: string | Types.ObjectId): Promise<void> {
  const txn = await ProviderTxn.findOne({ _id: txnId, kind: 'withdrawal' });
  if (!txn || !txn.payoutId || txn.status !== 'pending') return;
  const status = await fetchPayoutStatus(txn.payoutId);
  if (!status) return;
  txn.payoutStatus = status;
  const settled = payoutSettlement(status);
  if (settled) {
    txn.status = settled;
    txn.note = `RazorpayX payout ${status}`;
  }
  await txn.save();
}

export async function syncProviderPayoutById(payoutId: string): Promise<void> {
  const txn = await ProviderTxn.findOne({ kind: 'withdrawal', payoutId }).select('_id');
  if (txn) await syncProviderPayout(txn._id);
}
