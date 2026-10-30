import { Types } from 'mongoose';
import { ProviderTxn } from '../models/ProviderTxn';
import { ServiceBooking } from '../models/ServiceBooking';
import { User } from '../models/User';
import { ApiError } from '../utils/ApiError';
import { asyncHandler } from '../utils/asyncHandler';
import { ok, pageMeta } from '../utils/response';
import { escapeRegex } from '../utils/helpers';
import { loadSettings } from '../services/settings.service';
import { razorpayxConfig } from '../services/razorpayx.service';
import { pushToUsers } from '../services/firebase.service';
import {
  hasRunningPlan, payProviderWithdrawal, providerPayRules, providerWalletSummary, refreshProviderDue, syncProviderPayout,
} from '../services/providerPay.service';

const destinationFor = (method: 'upi' | 'bank', payout?: { upi?: string; bankHolder?: string; bankNumber?: string; bankIfsc?: string }) =>
  method === 'upi' ? payout?.upi : payout?.bankNumber ? `${payout.bankHolder ?? ''} · ${payout.bankNumber} · ${payout.bankIfsc ?? ''}` : undefined;

/* ============ Provider side ============ */

/** Everything the wallet screen shows: balance, dues, cash collected, the rules and the saved payout account. */
export const getWallet = asyncHandler(async (req, res) => {
  const id = req.user!.id;
  const inflight = await ProviderTxn.findOne({ provider: id, kind: 'withdrawal', status: 'pending', payoutId: { $exists: true } }).select('_id').lean();
  if (inflight) await syncProviderPayout(inflight._id).catch(() => undefined);
  const [{ settings }, sum, me, cash] = await Promise.all([
    loadSettings(),
    providerWalletSummary(id),
    User.findById(id).select('payout subscriptionUntil providerDue').lean(),
    ServiceBooking.aggregate<{ t: number; n: number }>([
      { $match: { provider: new Types.ObjectId(id), status: 'completed', paymentMethod: 'cod' } },
      { $group: { _id: null, t: { $sum: '$price' }, n: { $sum: 1 } } },
    ]),
  ]);
  const rules = providerPayRules(settings);
  // Keep the stored due in step with the ledger (it gates new bookings).
  if ((me?.providerDue ?? 0) !== sum.due) await User.updateOne({ _id: id }, { $set: { providerDue: sum.due } });
  const plan = hasRunningPlan(me);
  ok(res, {
    ...sum,
    cashCollected: cash[0]?.t ?? 0,
    cashBookings: cash[0]?.n ?? 0,
    commissionPct: plan ? 0 : rules.commissionPct,
    planCommissionPct: rules.commissionPct,
    hasPlan: plan,
    minWithdraw: rules.minWithdraw,
    dueLimit: rules.dueLimit,
    blocked: sum.due > rules.dueLimit,
    account: me?.payout ?? null,
  });
});

/** The passbook: earnings, commissions, dues payments and withdrawals, newest first. */
export const listTxns = asyncHandler(async (req, res) => {
  const { page, limit, kind } = req.query as unknown as { page: number; limit: number; kind?: string };
  const filter: Record<string, unknown> = { provider: req.user!.id };
  if (kind) filter.kind = kind;
  const [rows, total] = await Promise.all([
    ProviderTxn.find(filter).sort({ createdAt: -1 }).skip((page - 1) * limit).limit(limit).lean(),
    ProviderTxn.countDocuments(filter),
  ]);
  ok(res, rows, pageMeta(page, limit, total));
});

/** Save where the provider gets paid. */
export const saveAccount = asyncHandler(async (req, res) => {
  const { upi, bankHolder, bankNumber, bankIfsc } = req.body as { upi?: string; bankHolder?: string; bankNumber?: string; bankIfsc?: string };
  if (!upi && !(bankHolder && bankNumber && bankIfsc)) throw new ApiError(400, 'Add a UPI id, or the full bank account (holder name, number and IFSC).');
  const payout = { upi: upi || undefined, bankHolder: bankHolder || undefined, bankNumber: bankNumber || undefined, bankIfsc: bankIfsc || undefined };
  // Keep the cached RazorpayX ids; a changed account is re-checked by its fingerprint at payout time.
  const me = await User.findById(req.user!.id).select('payout').lean();
  await User.updateOne({ _id: req.user!.id }, { $set: { payout: { ...(me?.payout ?? {}), ...payout } } });
  ok(res, payout);
});

/** Withdraw part of the wallet (money from online bookings). Paid out by the super admin or RazorpayX. */
export const requestWithdraw = asyncHandler(async (req, res) => {
  const { amount, method } = req.body as { amount: number; method: 'upi' | 'bank' };
  const id = req.user!.id;
  const [{ settings }, me, sum] = await Promise.all([loadSettings(), User.findById(id).select('payout').lean(), providerWalletSummary(id)]);
  const rules = providerPayRules(settings);
  const destination = destinationFor(method, me?.payout);
  if (!destination) throw new ApiError(400, method === 'upi' ? 'Add your UPI id first.' : 'Add your bank account first.');
  if (sum.due > 0) throw new ApiError(409, `You have ₹${sum.due} commission due. Pay it first (you can pay it from your wallet), then withdraw.`);
  if (await ProviderTxn.exists({ provider: id, kind: 'withdrawal', status: 'pending' })) {
    throw new ApiError(409, 'You already have a withdrawal waiting. Please wait until it is paid.');
  }
  if (amount < rules.minWithdraw) throw new ApiError(400, `The smallest withdrawal is ₹${rules.minWithdraw}.`);
  if (amount > sum.balance) throw new ApiError(400, `You can withdraw up to ₹${Math.floor(sum.balance)}.`);
  const txn = await ProviderTxn.create({ provider: id, kind: 'withdrawal', amount: Math.round(amount), status: 'pending', method, destination, note: 'Withdrawal request' });
  const cfg = await razorpayxConfig();
  if (cfg?.autoPayout) await payProviderWithdrawal(txn._id).catch(() => undefined); // stays pending for the admin if it fails
  ok(res, (await ProviderTxn.findById(txn._id).lean()) ?? txn, undefined, 201);
});

/**
 * Pay commission dues. From the wallet it is settled at once; in cash or by
 * UPI to the office it waits for the super admin to confirm the money arrived
 * (new bookings resume once it is confirmed).
 */
export const payDues = asyncHandler(async (req, res) => {
  const { method, amount, reference, note } = req.body as { method: 'wallet' | 'cash' | 'upi'; amount?: number; reference?: string; note?: string };
  const id = req.user!.id;
  const sum = await providerWalletSummary(id);
  const open = Math.max(0, sum.due - sum.duePending);
  if (open <= 0) throw new ApiError(400, sum.duePending > 0 ? 'Your payment is waiting for the office to confirm.' : 'You have no commission due.');
  let amt = Math.min(Math.round((amount ?? open) * 100) / 100, open);
  if (method === 'wallet') {
    amt = Math.min(amt, sum.balance);
    if (amt <= 0) throw new ApiError(400, 'Your wallet balance is ₹0. Pay in cash or by UPI instead.');
  }
  if (method === 'upi' && !reference) throw new ApiError(400, 'Enter the UPI transaction id so the office can find your payment.');
  const txn = await ProviderTxn.create({
    provider: id,
    kind: 'commission_paid',
    amount: amt,
    method,
    reference,
    status: method === 'wallet' ? 'confirmed' : 'pending',
    note: note || (method === 'wallet' ? 'Commission paid from wallet' : method === 'cash' ? 'Commission handed to the office in cash' : 'Commission sent by UPI'),
  });
  await refreshProviderDue(id);
  ok(res, txn, undefined, 201);
});

/* ============ Super admin ============ */

/** Providers with commission due, and dues payments waiting to be confirmed. */
export const adminDues = asyncHandler(async (req, res) => {
  const q = typeof req.query.q === 'string' ? req.query.q.trim() : '';
  const filter: Record<string, unknown> = { role: 'provider', providerDue: { $gt: 0 } };
  if (q) {
    const rx = new RegExp(escapeRegex(q), 'i');
    filter.$or = [{ name: rx }, { phone: rx }, { providerId: rx }, { 'providerApplication.firm': rx }];
  }
  const [providers, payments] = await Promise.all([
    User.find(filter).select('name phone providerId providerDue providerApplication.firm').sort({ providerDue: -1 }).limit(200).lean(),
    ProviderTxn.find({ kind: 'commission_paid', status: 'pending' }).sort({ createdAt: -1 }).limit(200).populate('provider', 'name phone providerId').lean(),
  ]);
  const totalDue = providers.reduce((s, p) => s + (p.providerDue ?? 0), 0);
  ok(res, { providers, payments, totalDue: Math.round(totalDue * 100) / 100 });
});

/** Confirm (money arrived) or reject a provider's dues payment. */
export const adminMarkDuesPayment = asyncHandler(async (req, res) => {
  const { status, reference } = req.body as { status: 'confirmed' | 'rejected'; reference?: string };
  const txn = await ProviderTxn.findOne({ _id: req.params.id, kind: 'commission_paid' });
  if (!txn) throw new ApiError(404, 'Payment not found');
  if (txn.status !== 'pending') throw new ApiError(409, 'This payment was already handled.');
  txn.status = status;
  if (reference) txn.reference = reference;
  await txn.save();
  const due = await refreshProviderDue(txn.provider);
  void pushToUsers([String(txn.provider)], {
    title: status === 'confirmed' ? 'Commission received' : 'Commission payment not received',
    body: status === 'confirmed'
      ? `The office confirmed ₹${txn.amount}. ${due > 0 ? `₹${due} is still due.` : 'You can take new bookings again.'}`
      : `The office could not confirm your ₹${txn.amount} payment. Please contact support or pay again.`,
    data: { type: 'provider_dues', url: '/wallet' },
  });
  ok(res, { ...txn.toObject(), due });
});

/** The super admin records commission collected from a provider directly (e.g. cash at the office). */
export const adminCollectDues = asyncHandler(async (req, res) => {
  const { amount, note } = req.body as { amount?: number; note?: string };
  const provider = await User.exists({ _id: req.params.id, role: 'provider' });
  if (!provider) throw new ApiError(404, 'Provider not found');
  const sum = await providerWalletSummary(String(req.params.id));
  if (sum.due <= 0) throw new ApiError(400, 'This provider has no commission due.');
  const amt = Math.min(Math.round((amount ?? sum.due) * 100) / 100, sum.due);
  const txn = await ProviderTxn.create({ provider: req.params.id, kind: 'commission_paid', amount: amt, method: 'cash', status: 'confirmed', note: note || 'Collected by the office' });
  const due = await refreshProviderDue(String(req.params.id));
  void pushToUsers([String(req.params.id)], {
    title: 'Commission collected',
    body: `The office collected ₹${amt}. ${due > 0 ? `₹${due} is still due.` : 'You can take new bookings again.'}`,
    data: { type: 'provider_dues', url: '/wallet' },
  });
  ok(res, { ...txn.toObject(), due }, undefined, 201);
});

/** One provider's wallet + passbook for the admin. */
export const adminProviderWallet = asyncHandler(async (req, res) => {
  const id = String(req.params.id);
  const [sum, txns] = await Promise.all([
    providerWalletSummary(id),
    ProviderTxn.find({ provider: id }).sort({ createdAt: -1 }).limit(50).lean(),
  ]);
  ok(res, { ...sum, txns });
});

/** Provider withdrawal requests. */
export const adminListWithdrawals = asyncHandler(async (req, res) => {
  const { page, limit, status } = req.query as unknown as { page: number; limit: number; status?: string };
  const filter: Record<string, unknown> = { kind: 'withdrawal' };
  const st = status ?? 'pending';
  if (st !== 'all') filter.status = st;
  const inflight = await ProviderTxn.find({ kind: 'withdrawal', status: 'pending', payoutId: { $exists: true } }).select('_id').limit(25).lean();
  if (inflight.length) await Promise.all(inflight.map((t) => syncProviderPayout(t._id).catch(() => undefined)));
  const [rows, total, pending] = await Promise.all([
    ProviderTxn.find(filter).sort({ createdAt: -1 }).skip((page - 1) * limit).limit(limit).populate('provider', 'name phone providerId payout').lean(),
    ProviderTxn.countDocuments(filter),
    ProviderTxn.aggregate<{ t: number }>([{ $match: { kind: 'withdrawal', status: 'pending' } }, { $group: { _id: null, t: { $sum: '$amount' } } }]),
  ]);
  ok(res, rows, { ...pageMeta(page, limit, total), pendingTotal: pending[0]?.t ?? 0 });
});

/** Mark a provider withdrawal paid (paid by hand) or rejected (the balance returns). */
export const adminMarkWithdrawal = asyncHandler(async (req, res) => {
  const { status, reference } = req.body as { status: 'paid' | 'rejected'; reference?: string };
  const txn = await ProviderTxn.findOne({ _id: req.params.id, kind: 'withdrawal' });
  if (!txn) throw new ApiError(404, 'Withdrawal not found');
  if (txn.status !== 'pending') throw new ApiError(409, 'This withdrawal was already handled.');
  txn.status = status;
  if (reference) txn.reference = reference;
  await txn.save();
  void pushToUsers([String(txn.provider)], {
    title: status === 'paid' ? 'Withdrawal paid' : 'Withdrawal rejected',
    body: status === 'paid' ? `₹${txn.amount} was sent to ${txn.destination ?? 'your account'}.` : `Your ₹${txn.amount} withdrawal was rejected; the money is back in your wallet.`,
    data: { type: 'provider_withdrawal', url: '/wallet' },
  });
  ok(res, txn);
});

/** Pay a provider withdrawal through RazorpayX. */
export const adminPayWithdrawal = asyncHandler(async (req, res) => {
  const cfg = await razorpayxConfig();
  if (!cfg) throw new ApiError(400, 'RazorpayX payouts are not switched on. Set it up in Integrations, or use “Mark paid” after paying by hand.');
  await payProviderWithdrawal(String(req.params.id));
  ok(res, await ProviderTxn.findById(req.params.id).lean());
});
