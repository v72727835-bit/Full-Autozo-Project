import { Types } from 'mongoose';
import { Dispatch, IDispatch } from '../models/Dispatch';
import { Order } from '../models/Order';
import { Service } from '../models/Service';
import { ServiceBooking } from '../models/ServiceBooking';
import { User, riderWarehouseIds } from '../models/User';
import { pushToUsers } from './firebase.service';
import { providerPlanFilter, riderPlanFilter } from './subscription.service';
import { providerDueFilter } from './providerPay.service';

/**
 * The ring engine. On a new service booking (providers) or a packed order
 * (riders) we create a Dispatch and ring every eligible person nearby with a
 * loud, repeating push. The caller's app keeps the bell ringing (and keeps
 * polling `/ring`) until someone accepts or the person dismisses it.
 *
 * Nobody answered this round? `sweepDispatches()` (run on a timer) widens the
 * radius and rings again — so the bell "keeps ringing until accepted". When the
 * person who had the job cancels, they are excluded and the session re-opens so
 * the next-nearest people are rung instead ("ring the other nearby ones").
 */

const RING_SECONDS = 30;
/** Notification channel created by the rider / provider apps (RingModule.CHANNEL_ID). */
const RING_CHANNEL = 'autozo_ring_v1';
const MAX_ROUNDS = 6;
const START_RADIUS_KM = 5;
const RADIUS_STEP_KM = 5;
const MAX_CANDIDATES = 20;

const oid = (v: Types.ObjectId | string) => new Types.ObjectId(String(v));

/* ---------------- candidate finding ---------------- */

/** Who may be rung for a booking: approved, active, not paused or busy, dues cleared, and (when plans are on) with a running plan. */
async function eligibleProviderFilter() {
  return {
    role: 'provider',
    providerStatus: 'approved',
    isActive: true,
    providerPaused: { $ne: true },
    providerBusy: { $ne: true },
    ...(await providerPlanFilter()),
    // Unpaid commission over the limit: no new bookings until the super admin collects it.
    ...(await providerDueFilter()),
  };
}

/** Approved, un-paused, free providers who offer an active listing in this category, nearest first. */
export async function bookingCandidates(
  center: [number, number],
  category: Types.ObjectId,
  radiusKm: number,
  exclude: Set<string>,
): Promise<{ user: string; distanceKm: number }[]> {
  if (!center[0] && !center[1]) return []; // no location to search around
  const rows = await Service.aggregate<{ _id: Types.ObjectId; distM: number }>([
    {
      $geoNear: {
        near: { type: 'Point', coordinates: center },
        distanceField: 'distM',
        maxDistance: radiusKm * 1000,
        spherical: true,
        query: { category, isActive: true },
      },
    },
    // A provider is only rung for customers inside the radius they chose to serve.
    { $match: { $expr: { $lte: ['$distM', { $multiply: [{ $ifNull: ['$serviceRadiusKm', 10] }, 1000] }] } } },
    { $group: { _id: '$provider', distM: { $min: '$distM' } } },
    { $sort: { distM: 1 } },
    { $limit: MAX_CANDIDATES * 2 },
  ]);
  const dist = new Map(rows.map((r) => [String(r._id), r.distM]));
  const ids = rows.map((r) => r._id).filter((id) => !exclude.has(String(id)));
  if (!ids.length) return [];
  const providers = await User.find({ _id: { $in: ids }, ...(await eligibleProviderFilter()) })
    .select('_id')
    .lean();
  return providers
    .map((p) => ({ user: String(p._id), distanceKm: Math.round(((dist.get(String(p._id)) ?? 0) / 1000) * 10) / 10 }))
    .sort((a, b) => a.distanceKm - b.distanceKm)
    .slice(0, MAX_CANDIDATES);
}

/** Riders of the order's warehouse who could take it (right lane, not paused, plan ok). */
async function orderCandidates(orderId: Types.ObjectId, exclude: Set<string>): Promise<{ user: string; distanceKm: number }[]> {
  const order = await Order.findById(orderId).select('shop longDistance').lean();
  if (!order) return [];
  const riders = await User.find({
    role: 'rider',
    isActive: true,
    $or: [{ warehouse: order.shop }, { warehouses: order.shop }],
    riderPaused: { $ne: true },
    ...(await riderPlanFilter()),
    ...(order.longDistance ? { riderLongDistance: true } : { riderLongDistance: { $ne: true } }),
  })
    .select('_id')
    .lean();
  return riders.map((r) => ({ user: String(r._id), distanceKm: 0 })).filter((r) => !exclude.has(r.user));
}

async function candidatesFor(d: IDispatch, radiusKm: number, exclude: Set<string>): Promise<{ user: string; distanceKm: number }[]> {
  if (d.kind === 'order' && d.order) return orderCandidates(oid(d.order), exclude);
  if (d.kind === 'service_booking' && d.booking) {
    const booking = await ServiceBooking.findById(d.booking).select('category provider').lean();
    if (!booking) return [];
    const near = await bookingCandidates(d.center.coordinates, oid(booking.category), radiusKm, exclude);
    // The provider the customer actually picked is always rung first, wherever they are
    // (and even when neither side shared a map location).
    const own = String(booking.provider);
    if (exclude.has(own) || near.some((c) => c.user === own)) return near;
    const ok = await User.exists({ _id: booking.provider, ...(await eligibleProviderFilter()) });
    return ok ? [{ user: own, distanceKm: 0 }, ...near] : near;
  }
  return [];
}

/* ---------------- ringing ---------------- */

const num = (n?: string) => (n ? `#${n}` : '');

function ringPush(d: IDispatch & { _id: Types.ObjectId }, userIds: string[], label: string) {
  if (!userIds.length) return;
  void pushToUsers(userIds, {
    title: d.kind === 'order' ? 'New delivery — tap to accept' : 'New booking — tap to accept',
    body: label,
    data: {
      type: 'ring',
      ring: 'start',
      dispatchId: String(d._id),
      kind: d.kind,
      sound: 'ring',
      loop: 'true',
      ...(d.booking ? { bookingId: String(d.booking) } : {}),
      ...(d.order ? { orderId: String(d.order) } : {}),
      url: '/',
    },
    // The apps' loud "ring" channel (28-second bell on the alarm stream): it rings even with the
    // screen off or the app closed. Each round re-rings; the tag keeps one notification per job.
    android: { channelId: RING_CHANNEL, sound: 'autozo_ring', tag: `ring-${String(d._id)}`, ttlSeconds: RING_SECONDS * 2 },
  });
}

/**
 * Run one ring round on an active dispatch: pull in any new nearby candidates,
 * (re-)ring everyone still waiting, and schedule the next sweep. Mutates & saves `d`.
 */
async function ringRound(d: IDispatch & { _id: Types.ObjectId; save: () => Promise<unknown> }, label: string): Promise<void> {
  const exclude = new Set<string>([...d.excluded.map(String), ...d.candidates.filter((c) => c.state === 'declined').map((c) => String(c.user))]);
  const known = new Set(d.candidates.map((c) => String(c.user)));
  const fresh = (await candidatesFor(d, d.radiusKm, exclude)).filter((c) => !known.has(c.user));
  for (const c of fresh) {
    d.candidates.push({ user: oid(c.user), distanceKm: c.distanceKm, round: d.round, notifiedAt: new Date(), state: 'ringing' });
  }
  // Keep ringing everyone who hasn't declined and isn't excluded.
  const ringing: string[] = [];
  for (const c of d.candidates) {
    if (c.state === 'declined' || c.state === 'won' || exclude.has(String(c.user))) continue;
    c.state = 'ringing';
    c.notifiedAt = new Date();
    ringing.push(String(c.user));
  }
  d.nextSweepAt = new Date(Date.now() + d.ringSeconds * 1000);
  if (!ringing.length && d.round >= MAX_ROUNDS) {
    d.status = 'exhausted';
  }
  await d.save();
  ringPush(d, ringing, label);
}

/* ---------------- public API ---------------- */

/** Start ringing providers for a new service booking. */
export async function startBookingDispatch(bookingId: Types.ObjectId | string): Promise<void> {
  const booking = await ServiceBooking.findById(bookingId).select('bookingNumber address snapshot service').lean();
  if (!booking) return;
  const loc = booking.address.location;
  // No pin on the customer's address: search around the booked service's own location instead.
  const svc = loc ? null : await Service.findById(booking.service).select('location').lean();
  const fallback = svc?.location?.coordinates as [number, number] | undefined;
  const d = await Dispatch.create({
    kind: 'service_booking',
    booking: bookingId,
    ringSeconds: RING_SECONDS,
    radiusKm: START_RADIUS_KM,
    center: { type: 'Point', coordinates: loc ? [loc.lng, loc.lat] : fallback ?? [0, 0] },
  });
  await ServiceBooking.updateOne({ _id: bookingId }, { $set: { dispatch: d._id } });
  await ringRound(d as never, `${booking.snapshot.title} ${num(booking.bookingNumber)} in ${booking.address.city}.`);
}

/** Start ringing riders for a packed order. */
export async function startOrderDispatch(orderId: Types.ObjectId | string): Promise<void> {
  const order = await Order.findById(orderId).select('orderNumber address total').lean();
  if (!order) return;
  // One live dispatch per order.
  const existing = await Dispatch.findOne({ order: orderId, status: 'active' }).select('_id');
  if (existing) return;
  const loc = order.address.location;
  const d = await Dispatch.create({
    kind: 'order',
    order: orderId,
    ringSeconds: RING_SECONDS,
    radiusKm: START_RADIUS_KM,
    center: { type: 'Point', coordinates: loc ? [loc.lng, loc.lat] : [0, 0] },
  });
  await ringRound(d as never, `Order ${num(order.orderNumber)} is ready for pickup (₹${order.total}).`);
}

export interface RingItem {
  dispatchId: string;
  kind: string;
  bookingId?: string;
  orderId?: string;
  since: Date;
}

/** Active dispatches that are currently ringing this user (the app polls this to keep the bell on). */
export async function ringingForUser(userId: string): Promise<RingItem[]> {
  const rows = await Dispatch.find({
    status: 'active',
    candidates: { $elemMatch: { user: oid(userId), state: 'ringing' } },
    excluded: { $ne: oid(userId) },
  })
    .select('kind booking order updatedAt')
    .lean();
  return rows.map((d) => ({
    dispatchId: String(d._id),
    kind: d.kind,
    bookingId: d.booking ? String(d.booking) : undefined,
    orderId: d.order ? String(d.order) : undefined,
    since: d.updatedAt,
  }));
}

/**
 * A candidate accepts. Atomically claims the dispatch so only one person wins,
 * then hands them the job. Returns the booking/order id, or null if it was
 * already taken / no longer available.
 */
export async function acceptDispatch(
  dispatchId: string,
  userId: string,
): Promise<{ kind: string; bookingId?: string; orderId?: string } | null> {
  const d = await Dispatch.findOneAndUpdate(
    { _id: dispatchId, status: 'active', 'candidates.user': oid(userId), excluded: { $ne: oid(userId) } },
    { $set: { status: 'assigned', assignedTo: oid(userId) } },
    { new: true },
  );
  if (!d) return null;
  // Record who won and stop everyone else.
  for (const c of d.candidates) {
    if (String(c.user) === userId) c.state = 'won';
    else if (c.state === 'ringing') c.state = 'skipped';
  }
  await d.save();
  return { kind: d.kind, bookingId: d.booking ? String(d.booking) : undefined, orderId: d.order ? String(d.order) : undefined };
}

/** A candidate dismisses the ring. They stop ringing but others keep going. */
export async function declineDispatch(dispatchId: string, userId: string): Promise<void> {
  await Dispatch.updateOne(
    { _id: dispatchId, status: 'active', 'candidates.user': oid(userId) },
    { $set: { 'candidates.$[c].state': 'declined' } },
    { arrayFilters: [{ 'c.user': oid(userId) }] },
  );
}

/** Re-open a dispatch so the next-nearest people are rung, permanently excluding `excludeUserId`. */
export async function reopenDispatch(dispatchId: string, excludeUserId: string, label: string): Promise<void> {
  const d = await Dispatch.findById(dispatchId);
  if (!d) return;
  if (!d.excluded.map(String).includes(excludeUserId)) d.excluded.push(oid(excludeUserId));
  d.assignedTo = undefined;
  d.status = 'active';
  d.round += 1;
  d.radiusKm = Math.min(d.radiusKm + RADIUS_STEP_KM, START_RADIUS_KM + RADIUS_STEP_KM * MAX_ROUNDS);
  await ringRound(d as never, label);
}

/** A rider took an order through the normal accept flow: stop every other rider's ring. */
export async function orderAccepted(orderId: Types.ObjectId | string, riderId: string): Promise<void> {
  await Dispatch.updateMany(
    { order: orderId, status: 'active' },
    { $set: { status: 'assigned', assignedTo: oid(riderId) } },
  );
}

/** A rider dropped a delivery: ring the next-nearest riders, excluding the one who dropped it. */
export async function orderDropped(orderId: Types.ObjectId | string, riderId: string): Promise<void> {
  const d = await Dispatch.findOne({ order: orderId }).sort({ createdAt: -1 }).select('_id');
  if (d) return reopenDispatch(String(d._id), riderId, 'A delivery is back in the queue. Tap to accept.');
  return startOrderDispatch(orderId);
}

/** Stop a dispatch for good (customer cancelled, or the job is done). */
export async function cancelDispatch(filter: { booking?: Types.ObjectId | string; order?: Types.ObjectId | string }): Promise<void> {
  const q: Record<string, unknown> = { status: { $in: ['active', 'assigned'] } };
  if (filter.booking) q.booking = filter.booking;
  if (filter.order) q.order = filter.order;
  await Dispatch.updateMany(q, { $set: { status: 'cancelled' } });
}

/**
 * The timer-driven sweep: every active dispatch whose ring round has run out of
 * time gets another round (wider radius) until someone accepts or we run out of
 * rounds. This is what makes the bell keep ringing.
 */
export async function sweepDispatches(): Promise<void> {
  const due = await Dispatch.find({ status: 'active', nextSweepAt: { $lte: new Date() } }).limit(50);
  for (const d of due) {
    if (d.round >= MAX_ROUNDS) {
      // Give the current ring one last cycle, then exhaust it.
      const anyRinging = d.candidates.some((c) => c.state === 'ringing');
      if (!anyRinging) {
        d.status = 'exhausted';
        await d.save();
        await onExhausted(d);
        continue;
      }
    }
    d.round += 1;
    d.radiusKm = Math.min(d.radiusKm + RADIUS_STEP_KM, START_RADIUS_KM + RADIUS_STEP_KM * MAX_ROUNDS);
    await ringRound(d as never, d.kind === 'order' ? 'A delivery is still waiting. Tap to accept.' : 'A booking is still waiting. Tap to accept.');
  }
}

/** Run the sweep on a timer so rings keep going and widen until someone accepts. */
export function startDispatchSweep(): void {
  const run = () => void sweepDispatches().catch((e) => console.error('[dispatch] sweep failed:', (e as Error).message));
  setInterval(run, 15_000).unref();
}

/** Nobody took it: mark the booking rejected so the customer isn't left waiting. */
async function onExhausted(d: IDispatch): Promise<void> {
  if (d.kind === 'service_booking' && d.booking) {
    const booking = await ServiceBooking.findOneAndUpdate(
      { _id: d.booking, status: 'requested' },
      { $set: { status: 'rejected' }, $push: { statusHistory: { status: 'rejected', at: new Date(), by: 'system', note: 'No provider accepted' } } },
      { new: true },
    ).lean();
    if (booking) {
      void pushToUsers([String(booking.customer)], {
        title: 'No provider available',
        body: `We could not find a provider for booking ${num(booking.bookingNumber)} right now. Any payment will be refunded.`,
        data: { type: 'booking_rejected', bookingId: String(booking._id), url: `/bookings/${String(booking._id)}` },
      });
    }
  }
}
