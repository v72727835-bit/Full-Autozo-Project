import { FilterQuery, Types } from 'mongoose';
import { RequestHandler } from 'express';
import { SubscriptionAudience, SubscriptionPlan } from '../models/SubscriptionPlan';
import { IUser, User } from '../models/User';
import { ApiError } from '../utils/ApiError';
import { pushToUsers } from './firebase.service';
import { razorpayEnabled } from './razorpay.service';
import { loadSettings } from './settings.service';

/**
 * Paid plans for riders and warehouses (sellers). The super admin switches each one on or off and
 * sets the plans; while a switch is on, a rider without an active plan gets no new orders and a
 * warehouse without one cannot see orders or add products. Switched off, everyone works for free.
 */

const DAY_MS = 24 * 60 * 60 * 1000;
/** The "plan ends soon" push goes out this long before the end. */
export const REMIND_BEFORE_MS = 3 * DAY_MS;

export const audienceOf = (role?: string): SubscriptionAudience | null => (role === 'rider' ? 'rider' : role === 'seller' ? 'seller' : null);

export async function subscriptionSwitches(): Promise<Record<SubscriptionAudience, boolean>> {
  const { settings } = await loadSettings();
  return { rider: !!settings.subscriptions?.rider, seller: !!settings.subscriptions?.seller };
}

export const planActive = (until?: Date | null, now = new Date()): boolean => !!until && new Date(until).getTime() > now.getTime();

/** True when plans are switched on for this audience and the user has no running plan. */
export async function needsPlan(audience: SubscriptionAudience, user: { subscriptionUntil?: Date | null }): Promise<boolean> {
  return (await subscriptionSwitches())[audience] && !planActive(user.subscriptionUntil);
}

/** Added to rider queries that pick who may get new orders. Empty while rider plans are off. */
export async function riderPlanFilter(): Promise<FilterQuery<IUser>> {
  return (await subscriptionSwitches()).rider ? { subscriptionUntil: { $gt: new Date() } } : {};
}

export const PLAN_MESSAGE: Record<SubscriptionAudience, string> = {
  rider: 'Your plan is not active. Buy a plan to get new orders.',
  seller: 'Your plan is not active. Buy a plan to see orders and add products.',
};

export const planRequiredError = (audience: SubscriptionAudience) => new ApiError(402, PLAN_MESSAGE[audience], { code: 'subscription_required' });

/** Route guard for rider / seller routes that need a running plan. Use after `protect`. */
export const requirePlan =
  (audience: SubscriptionAudience): RequestHandler =>
  (req, _res, next) => {
    (async () => {
      if (!(await subscriptionSwitches())[audience]) return next();
      const user = await User.findById(req.user!.id).select('subscriptionUntil').lean();
      if (!user || !planActive(user.subscriptionUntil)) return next(planRequiredError(audience));
      next();
    })().catch(next);
  };

/** What the rider app / warehouse panel shows on its "My plan" screen. */
export async function planStatus(userId: string, audience: SubscriptionAudience) {
  const [switches, user, plans, gateway] = await Promise.all([
    subscriptionSwitches(),
    User.findById(userId).select('subscriptionUntil').lean(),
    SubscriptionPlan.find({ audience, active: true }).sort({ sort: 1, price: 1 }).select('name price days description').lean(),
    razorpayEnabled(),
  ]);
  const until = user?.subscriptionUntil ?? null;
  const active = planActive(until);
  return {
    required: switches[audience],
    active,
    until,
    daysLeft: active ? Math.ceil((new Date(until!).getTime() - Date.now()) / DAY_MS) : 0,
    plans,
    canPayOnline: gateway,
  };
}

/**
 * Adds days to a user's plan in one atomic step: a running plan is extended from its end, an ended
 * (or never bought) one starts now. Returns the period the days cover.
 */
export async function addPlanDays(userId: string | Types.ObjectId, days: number): Promise<{ startsAt: Date; endsAt: Date }> {
  const now = new Date();
  const before = await User.findOneAndUpdate(
    { _id: userId },
    [{ $set: { subscriptionUntil: { $add: [{ $max: ['$subscriptionUntil', now] }, days * DAY_MS] }, subscriptionRemindedFor: null } }],
    { new: false, projection: { subscriptionUntil: 1 } },
  ).lean();
  if (!before) throw new ApiError(404, 'Account not found');
  const startsAt = planActive(before.subscriptionUntil, now) ? new Date(before.subscriptionUntil!) : now;
  return { startsAt, endsAt: new Date(startsAt.getTime() + days * DAY_MS) };
}

/** One pass of the "your plan ends in 3 days" push. Each plan end is reminded once. */
export async function sendPlanReminders(): Promise<number> {
  const switches = await subscriptionSwitches();
  const roles = (Object.keys(switches) as SubscriptionAudience[]).filter((a) => switches[a]);
  if (!roles.length) return 0;
  const now = new Date();
  const due = await User.find({
    role: { $in: roles },
    isActive: true,
    subscriptionUntil: { $gt: now, $lte: new Date(now.getTime() + REMIND_BEFORE_MS) },
    $expr: { $ne: ['$subscriptionRemindedFor', '$subscriptionUntil'] },
  })
    .select('role subscriptionUntil')
    .lean();
  for (const u of due) {
    const days = Math.max(1, Math.ceil((new Date(u.subscriptionUntil!).getTime() - now.getTime()) / DAY_MS));
    await pushToUsers([u._id], {
      title: 'Your plan ends soon',
      body: `Your Autozo plan ends in ${days} day${days === 1 ? '' : 's'}. Renew it to keep ${u.role === 'rider' ? 'getting orders' : 'your orders and products running'}.`,
      data: { type: 'subscription' },
    }).catch(() => 0);
    await User.updateOne({ _id: u._id, subscriptionUntil: u.subscriptionUntil }, { $set: { subscriptionRemindedFor: u.subscriptionUntil } });
  }
  return due.length;
}

/** Runs the reminder every hour for as long as the server is up. */
export function startPlanReminders() {
  const run = () => void sendPlanReminders().catch((e) => console.error('Plan reminders failed:', e));
  setTimeout(run, 60_000).unref();
  setInterval(run, 60 * 60 * 1000).unref();
}
