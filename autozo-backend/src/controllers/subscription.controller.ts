import { FilterQuery } from 'mongoose';
import { ISubscriptionPayment, SubscriptionPayment } from '../models/SubscriptionPayment';
import { SubscriptionAudience, SubscriptionPlan } from '../models/SubscriptionPlan';
import { Settings } from '../models/Settings';
import { IUser, User } from '../models/User';
import { capturedPaymentFor, createRazorpayOrder, razorpayEnabled, razorpayKeys, verifyRazorpaySignature } from '../services/razorpay.service';
import { clearSettingsCache, getSettingsDoc } from '../services/settings.service';
import { addPlanDays, audienceOf, planActive, planStatus, subscriptionSwitches } from '../services/subscription.service';
import { ApiError } from '../utils/ApiError';
import { asyncHandler } from '../utils/asyncHandler';
import { escapeRegex } from '../utils/helpers';
import { created, ok, pageMeta } from '../utils/response';

const myAudience = (role?: string): SubscriptionAudience => {
  const a = audienceOf(role);
  if (!a) throw new ApiError(403, 'Plans are only for riders, warehouses and service providers.');
  return a;
};

/* ---------- rider app / warehouse panel ---------- */

export const myPlan = asyncHandler(async (req, res) => {
  ok(res, await planStatus(req.user!.id, myAudience(req.user!.role)));
});

/** Starts a Razorpay payment for a plan. The days are added only once `confirmPlanPayment` verifies it. */
export const startPlanPayment = asyncHandler(async (req, res) => {
  const audience = myAudience(req.user!.role);
  const { planId } = req.body as { planId: string };
  const plan = await SubscriptionPlan.findOne({ _id: planId, audience, active: true }).lean();
  if (!plan) throw new ApiError(404, 'This plan is not available any more. Pick another plan.');
  if (!(await razorpayEnabled())) throw new ApiError(503, 'Online payment is not switched on. Please contact Autozo.');
  const rzp = await createRazorpayOrder(plan.price, `sub-${Date.now()}`, { user: req.user!.id, plan: String(plan._id), kind: 'subscription' });
  await SubscriptionPayment.create({
    user: req.user!.id,
    audience,
    source: 'razorpay',
    plan: plan._id,
    planName: plan.name,
    days: plan.days,
    amount: plan.price,
    razorpayOrderId: rzp.id,
  });
  created(res, { razorpayOrderId: rzp.id, amount: rzp.amount, currency: rzp.currency, keyId: (await razorpayKeys())!.keyId, planName: plan.name });
});

/** Razorpay says it is paid: check the signature, then add the plan's days (once). */
export const confirmPlanPayment = asyncHandler(async (req, res) => {
  const userId = req.user!.id;
  const audience = myAudience(req.user!.role);
  const { razorpay_order_id, razorpay_payment_id, razorpay_signature } = req.body as {
    razorpay_order_id: string;
    razorpay_payment_id: string;
    razorpay_signature: string;
  };
  if (!(await verifyRazorpaySignature(razorpay_order_id, razorpay_payment_id, razorpay_signature))) {
    throw new ApiError(400, 'We could not verify this payment. If money was deducted, contact Autozo with the payment id.');
  }
  // Only one request can flip "created" to "paid", so the days are never added twice.
  const payment = await SubscriptionPayment.findOneAndUpdate(
    { razorpayOrderId: razorpay_order_id, user: userId, status: 'created' },
    { $set: { status: 'paid', paymentId: razorpay_payment_id } },
    { new: true },
  );
  if (!payment) {
    const done = await SubscriptionPayment.exists({ razorpayOrderId: razorpay_order_id, user: userId, status: 'paid' });
    if (!done) throw new ApiError(404, 'Payment not found.');
    return ok(res, await planStatus(userId, audience));
  }
  const period = await addPlanDays(userId, payment.days);
  await SubscriptionPayment.updateOne({ _id: payment._id }, { $set: period });
  ok(res, await planStatus(userId, audience));
});

/**
 * Recovers a plan payment whose confirmation never reached us (the app closed, the network dropped):
 * asks Razorpay which started payments were really captured and adds those days - once each.
 */
export const syncPlanPayments = asyncHandler(async (req, res) => {
  const userId = req.user!.id;
  const audience = myAudience(req.user!.role);
  const open = await SubscriptionPayment.find({ user: userId, source: 'razorpay', status: 'created', razorpayOrderId: { $exists: true } }).sort({ createdAt: -1 }).limit(10).lean();
  let credited = 0;
  for (const p of open) {
    const paymentId = await capturedPaymentFor(p.razorpayOrderId!).catch(() => null);
    if (!paymentId) continue;
    const payment = await SubscriptionPayment.findOneAndUpdate({ _id: p._id, status: 'created' }, { $set: { status: 'paid', paymentId } }, { new: true });
    if (!payment) continue;
    const period = await addPlanDays(userId, payment.days);
    await SubscriptionPayment.updateOne({ _id: payment._id }, { $set: period });
    credited++;
  }
  ok(res, { credited, plan: await planStatus(userId, audience) });
});

export const myPlanPayments = asyncHandler(async (req, res) => {
  const rows = await SubscriptionPayment.find({ user: req.user!.id, status: 'paid' })
    .sort({ createdAt: -1 })
    .limit(30)
    .select('planName days amount source startsAt endsAt createdAt note')
    .lean();
  ok(res, rows);
});

/* ---------- super admin ---------- */

export const adminSubscriptionOverview = asyncHandler(async (_req, res) => {
  const now = new Date();
  const [switches, plans, activeRiders, activeSellers, activeProviders, riders, sellers, providers, revenue] = await Promise.all([
    subscriptionSwitches(),
    SubscriptionPlan.find().sort({ audience: 1, sort: 1, price: 1 }).lean(),
    User.countDocuments({ role: 'rider', deletedAt: { $exists: false }, subscriptionUntil: { $gt: now } }),
    User.countDocuments({ role: 'seller', deletedAt: { $exists: false }, subscriptionUntil: { $gt: now } }),
    User.countDocuments({ role: 'provider', deletedAt: { $exists: false }, subscriptionUntil: { $gt: now } }),
    User.countDocuments({ role: 'rider', deletedAt: { $exists: false } }),
    User.countDocuments({ role: 'seller', deletedAt: { $exists: false } }),
    User.countDocuments({ role: 'provider', deletedAt: { $exists: false } }),
    SubscriptionPayment.aggregate<{ _id: SubscriptionAudience; total: number }>([
      { $match: { status: 'paid', source: 'razorpay' } },
      { $group: { _id: '$audience', total: { $sum: '$amount' } } },
    ]),
  ]);
  const earned = (a: SubscriptionAudience) => revenue.find((r) => r._id === a)?.total ?? 0;
  ok(res, {
    switches,
    plans,
    rider: { total: riders, active: activeRiders, revenue: earned('rider') },
    seller: { total: sellers, active: activeSellers, revenue: earned('seller') },
    provider: { total: providers, active: activeProviders, revenue: earned('provider') },
  });
});

export const adminSetSwitches = asyncHandler(async (req, res) => {
  await getSettingsDoc();
  const body = req.body as Partial<Record<SubscriptionAudience, boolean>>;
  const $set: Record<string, boolean> = {};
  if (typeof body.rider === 'boolean') $set['subscriptions.rider'] = body.rider;
  if (typeof body.seller === 'boolean') $set['subscriptions.seller'] = body.seller;
  if (typeof body.provider === 'boolean') $set['subscriptions.provider'] = body.provider;
  await Settings.updateOne({ key: 'global' }, { $set });
  clearSettingsCache();
  ok(res, await subscriptionSwitches());
});

export const adminCreatePlan = asyncHandler(async (req, res) => {
  created(res, await SubscriptionPlan.create(req.body));
});

export const adminUpdatePlan = asyncHandler(async (req, res) => {
  const plan = await SubscriptionPlan.findByIdAndUpdate(req.params.id, { $set: req.body }, { new: true, runValidators: true }).lean();
  if (!plan) throw new ApiError(404, 'Plan not found');
  ok(res, plan);
});

/** A plan someone already bought is only hidden, so their history keeps its name; an unused one is removed. */
export const adminDeletePlan = asyncHandler(async (req, res) => {
  const used = await SubscriptionPayment.exists({ plan: req.params.id });
  if (used) {
    await SubscriptionPlan.updateOne({ _id: req.params.id }, { $set: { active: false } });
    return ok(res, { hidden: true });
  }
  await SubscriptionPlan.deleteOne({ _id: req.params.id });
  ok(res, { deleted: true });
});

/** Riders or warehouses with their plan end date, for the admin list. */
export const adminSubscribers = asyncHandler(async (req, res) => {
  const { audience, status, q, page, limit } = req.query as unknown as {
    audience: SubscriptionAudience;
    status?: 'active' | 'expired' | 'never';
    q?: string;
    page: number;
    limit: number;
  };
  const now = new Date();
  const filter: FilterQuery<IUser> = { role: audience, deletedAt: { $exists: false } };
  if (status === 'active') filter.subscriptionUntil = { $gt: now };
  else if (status === 'expired') filter.subscriptionUntil = { $lte: now };
  else if (status === 'never') filter.subscriptionUntil = { $in: [null] };
  if (q) {
    const rx = new RegExp(escapeRegex(q), 'i');
    filter.$or = [{ name: rx }, { phone: rx }, { sellerId: rx }, { providerId: rx }];
  }
  const [rows, total] = await Promise.all([
    User.find(filter)
      .select('name phone sellerId providerId providerApplication isActive subscriptionUntil warehouse warehouses sellerWarehouses createdAt')
      .populate('warehouses', 'name')
      .populate('sellerWarehouses', 'name')
      .sort({ subscriptionUntil: -1, name: 1 })
      .skip((page - 1) * limit)
      .limit(limit)
      .lean(),
    User.countDocuments(filter),
  ]);
  ok(
    res,
    rows.map((u) => ({ ...u, planActive: planActive(u.subscriptionUntil, now) })),
    pageMeta(page, limit, total),
  );
});

/** Free days from the super admin (a trial, a goodwill extension), recorded like a purchase. */
export const adminGrantDays = asyncHandler(async (req, res) => {
  const { days, note } = req.body as { days: number; note?: string };
  const user = await User.findById(req.params.id).select('role').lean();
  const audience = audienceOf(user?.role);
  if (!user || !audience) throw new ApiError(404, 'Rider, warehouse or provider not found');
  const period = await addPlanDays(user._id, days);
  await SubscriptionPayment.create({ user: user._id, audience, source: 'admin', planName: 'Given by admin', days, amount: 0, status: 'paid', note, ...period });
  ok(res, { subscriptionUntil: period.endsAt });
});

/** Ends a running plan right now. */
export const adminEndPlan = asyncHandler(async (req, res) => {
  const user = await User.findOneAndUpdate(
    { _id: req.params.id, role: { $in: ['rider', 'seller', 'provider'] } },
    { $set: { subscriptionUntil: new Date(), subscriptionRemindedFor: null } },
    { new: true },
  )
    .select('subscriptionUntil')
    .lean();
  if (!user) throw new ApiError(404, 'Rider or warehouse not found');
  ok(res, { subscriptionUntil: user.subscriptionUntil });
});

export const adminPlanPayments = asyncHandler(async (req, res) => {
  const { audience, user, page, limit } = req.query as unknown as { audience?: SubscriptionAudience; user?: string; page: number; limit: number };
  const filter: FilterQuery<ISubscriptionPayment> = { status: 'paid' };
  if (audience) filter.audience = audience;
  if (user) filter.user = user;
  const [rows, total] = await Promise.all([
    SubscriptionPayment.find(filter)
      .populate('user', 'name phone sellerId providerId role')
      .sort({ createdAt: -1 })
      .skip((page - 1) * limit)
      .limit(limit)
      .lean(),
    SubscriptionPayment.countDocuments(filter),
  ]);
  ok(res, rows, pageMeta(page, limit, total));
});
