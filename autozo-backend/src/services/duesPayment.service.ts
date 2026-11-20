import { Types } from 'mongoose';
import { DuesKind, DuesPayment, IDuesPayment } from '../models/DuesPayment';
import { ProviderTxn } from '../models/ProviderTxn';
import { WalletTxn } from '../models/WalletTxn';
import { ApiError } from '../utils/ApiError';
import { capturedPaymentFor, createRazorpayOrder, razorpayEnabled, razorpayKeys, verifyRazorpaySignature } from './razorpay.service';
import { providerWalletSummary, refreshProviderDue } from './providerPay.service';
import { awaitingCash, payableCod, settleRiderCod } from './rider.service';

/**
 * Riders and service providers pay the cash they owe the office online. The money goes to the
 * admin's Razorpay account, and the rider's cash / provider's commission clears by itself - no
 * waiting for someone to confirm. A payment is credited exactly once.
 */
const round2 = (n: number) => Math.round(n * 100) / 100;
const MIN_RUPEES = 1; // Razorpay will not take less

const kindOf = (role?: string): DuesKind => {
  if (role === 'rider') return 'rider_cash';
  if (role === 'provider') return 'provider_dues';
  throw new ApiError(403, 'Only riders and service providers have cash to pay the office.');
};

/** What this person can pay right now, in rupees (the whole amount owed, or less if they asked for less). */
async function payableFor(userId: string, kind: DuesKind, asked?: number): Promise<number> {
  if (kind === 'rider_cash') {
    const { owed, payable, oldest } = await payableCod(userId, asked);
    const awaiting = await awaitingCash(userId);
    if (awaiting > 0 && awaiting >= owed) throw new ApiError(409, 'You already handed in this cash. It is waiting for the office to confirm.');
    if (owed <= 0) throw new ApiError(400, 'You have no cash to pay right now.');
    if (payable <= 0) throw new ApiError(400, `The smallest amount you can pay is ₹${Math.ceil(oldest)} (your oldest delivery).`);
    return round2(payable);
  }
  const sum = await providerWalletSummary(userId);
  const open = Math.max(0, sum.due - sum.duePending);
  if (open <= 0) throw new ApiError(400, sum.duePending > 0 ? 'Your payment is waiting for the office to confirm.' : 'You have no commission due.');
  return round2(Math.min(asked ?? open, open));
}

export async function startDuesPayment(userId: string, role: string | undefined, asked?: number) {
  const kind = kindOf(role);
  if (!(await razorpayEnabled())) throw new ApiError(503, 'Online payment is not switched on. Please contact Autozo.');
  const amount = await payableFor(userId, kind, asked);
  if (amount < MIN_RUPEES) throw new ApiError(400, `Online payment needs at least ₹${MIN_RUPEES}. Hand this small amount to the office instead.`);
  const order = await createRazorpayOrder(amount, `dues-${Date.now()}`, { user: userId, kind });
  await DuesPayment.create({ user: userId, kind, amount, razorpayOrderId: order.id });
  return { razorpayOrderId: order.id, amount: order.amount, currency: order.currency, keyId: (await razorpayKeys())!.keyId, kind, rupees: amount };
}

/** Applies a paid payment to the rider's cash / provider's commission. Safe to run again. */
async function credit(payment: IDuesPayment & { _id: Types.ObjectId }): Promise<void> {
  if (payment.creditedAt) return;
  // Only one caller applies the money. A lock older than two minutes belongs to a crashed attempt and is retaken.
  const lock = await DuesPayment.findOneAndUpdate(
    { _id: payment._id, creditedAt: { $exists: false }, $or: [{ creditingAt: { $exists: false } }, { creditingAt: { $lt: new Date(Date.now() - 120_000) } }] },
    { $set: { creditingAt: new Date() } },
  ).lean();
  if (!lock) return;
  const ref = payment.paymentId ?? payment.razorpayOrderId;
  if (payment.kind === 'rider_cash') {
    if (!(await WalletTxn.exists({ rider: payment.user, kind: 'cash_submit', reference: ref }))) {
      await settleRiderCod(payment.user, payment.amount);
      await WalletTxn.create({ rider: payment.user, kind: 'cash_submit', amount: payment.amount, status: 'confirmed', reference: ref, note: 'Paid online (Razorpay)' });
    }
  } else if (!(await ProviderTxn.exists({ provider: payment.user, kind: 'commission_paid', reference: ref }))) {
    await ProviderTxn.create({ provider: payment.user, kind: 'commission_paid', amount: payment.amount, method: 'online', reference: ref, status: 'confirmed', note: 'Commission paid online (Razorpay)' });
    await refreshProviderDue(payment.user);
  }
  await DuesPayment.updateOne({ _id: payment._id }, { $set: { creditedAt: new Date() } });
}

/** Marks one started payment paid (only one caller can) and credits it. Returns whether this call did it. */
async function claimAndCredit(filter: Record<string, unknown>, paymentId: string): Promise<boolean> {
  const claimed = await DuesPayment.findOneAndUpdate({ ...filter, status: 'created' }, { $set: { status: 'paid', paymentId } }, { new: true }).lean();
  if (!claimed) return false;
  await credit(claimed as IDuesPayment & { _id: Types.ObjectId });
  return true;
}

/** The app says the payment went through: verify the signature, then credit (once). */
export async function confirmDuesPayment(userId: string, ids: { razorpay_order_id: string; razorpay_payment_id: string; razorpay_signature: string }): Promise<void> {
  if (!(await verifyRazorpaySignature(ids.razorpay_order_id, ids.razorpay_payment_id, ids.razorpay_signature))) {
    throw new ApiError(400, 'We could not verify this payment. If money was deducted, contact Autozo with the payment id.');
  }
  const filter = { razorpayOrderId: ids.razorpay_order_id, user: userId };
  if (await claimAndCredit(filter, ids.razorpay_payment_id)) return;
  const existing = await DuesPayment.findOne(filter).lean();
  if (!existing) throw new ApiError(404, 'Payment not found.');
  // Already paid by an earlier confirmation or sync: make sure it was credited, then answer OK.
  if (existing.status === 'paid') await credit(existing as IDuesPayment & { _id: Types.ObjectId });
}

/**
 * Catches payments whose confirmation never arrived: asks Razorpay which started payments were really
 * captured and credits them, and retries any paid payment that was never credited. Credits nothing
 * for an abandoned payment.
 */
export async function syncDuesPayments(userId: string): Promise<number> {
  let credited = 0;
  const open = await DuesPayment.find({ user: userId, status: 'created' }).sort({ createdAt: -1 }).limit(10).lean();
  for (const p of open) {
    const paymentId = await capturedPaymentFor(p.razorpayOrderId).catch(() => null);
    if (paymentId && (await claimAndCredit({ _id: p._id }, paymentId))) credited++;
  }
  for (const p of await DuesPayment.find({ user: userId, status: 'paid', creditedAt: { $exists: false } }).limit(10).lean()) {
    await credit(p as IDuesPayment & { _id: Types.ObjectId });
    credited++;
  }
  return credited;
}
