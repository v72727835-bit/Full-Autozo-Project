import { DuesPayment } from '../models/DuesPayment';
import { confirmDuesPayment, startDuesPayment, syncDuesPayments } from '../services/duesPayment.service';
import { asyncHandler } from '../utils/asyncHandler';
import { created, ok } from '../utils/response';

/** A rider or service provider starts paying the office what they owe, online. */
export const payDues = asyncHandler(async (req, res) => {
  const { amount } = req.body as { amount?: number };
  created(res, await startDuesPayment(req.user!.id, req.user!.role, amount));
});

/** Razorpay says it is paid: verify the signature and clear the cash / commission (once). */
export const confirmDues = asyncHandler(async (req, res) => {
  await confirmDuesPayment(req.user!.id, req.body as { razorpay_order_id: string; razorpay_payment_id: string; razorpay_signature: string });
  ok(res, { message: 'Payment received. Thank you!' });
});

/** Recovers a payment whose confirmation never reached us (the app closed, the network dropped). */
export const syncDues = asyncHandler(async (req, res) => {
  ok(res, { credited: await syncDuesPayments(req.user!.id) });
});

/** Super admin: what riders and providers have paid the office online, newest first, with the total. */
export const adminDuesPayments = asyncHandler(async (_req, res) => {
  const [rows, totals] = await Promise.all([
    DuesPayment.find({ status: 'paid' }).sort({ createdAt: -1 }).limit(200).populate('user', 'name phone role providerId').lean(),
    DuesPayment.aggregate<{ _id: string; total: number; count: number }>([{ $match: { status: 'paid' } }, { $group: { _id: '$kind', total: { $sum: '$amount' }, count: { $sum: 1 } } }]),
  ]);
  const by = (kind: string) => totals.find((t) => t._id === kind) ?? { total: 0, count: 0 };
  ok(res, rows, { riderCash: by('rider_cash'), providerDues: by('provider_dues') });
});
