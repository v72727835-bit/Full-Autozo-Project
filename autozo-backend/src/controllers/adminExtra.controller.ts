import { FilterQuery, Types } from 'mongoose';
import { AdminAlert } from '../models/AdminAlert';
import { Notice } from '../models/Notice';
import { IOrder, Order } from '../models/Order';
import { Enquiry } from '../models/Enquiry';
import { Integrations } from '../models/Integrations';
import { Product } from '../models/Product';
import { Settings } from '../models/Settings';
import { StandardCategory } from '../models/StandardCategory';
import { StockAlert } from '../models/StockAlert';
import { Ticket } from '../models/Ticket';
import { User } from '../models/User';
import { clearCatalogCache } from '../middleware/cache';
import { getIntegrations, invalidateIntegrations } from '../services/integrations.service';
import { razorpayKeys, testRazorpayKeys } from '../services/razorpay.service';
import { seal } from '../utils/secretBox';
import { codSummary, ONLINE_WINDOW_MS } from '../services/rider.service';
import { getSettingsDoc } from '../services/settings.service';
import { ApiError } from '../utils/ApiError';
import { asyncHandler } from '../utils/asyncHandler';
import { escapeRegex } from '../utils/helpers';
import { created, ok, pageMeta } from '../utils/response';

/* ============ Settings (festival tab, 6-day aisles, COD, rider limit, app links) ============ */

export const getSettings = asyncHandler(async (_req, res) => {
  await getSettingsDoc(); // creates the defaults on first use
  const settings = await Settings.findOne({ key: 'global' })
    .populate('festival.sections.category', 'name slug level')
    .populate('sixDay.categories', 'name slug level')
    .populate('cod.disabledCategories', 'name slug level')
    .populate('cartPoints.suggestions', 'name unit')
    .lean();
  ok(res, settings);
});

export const updateSettings = asyncHandler(async (req, res) => {
  await getSettingsDoc();
  const body = req.body as Record<string, Record<string, unknown> | number | undefined>;
  // Flatten one level so a partial update ({ festival: { name } }) keeps the other festival fields.
  const $set: Record<string, unknown> = {};
  for (const [key, value] of Object.entries(body)) {
    if (value && typeof value === 'object' && !Array.isArray(value)) {
      for (const [inner, v] of Object.entries(value)) $set[`${key}.${inner}`] = v;
    } else $set[key] = value;
  }
  await Settings.updateOne({ key: 'global' }, { $set });
  clearCatalogCache();
  const settings = await Settings.findOne({ key: 'global' })
    .populate('festival.sections.category', 'name slug level')
    .populate('sixDay.categories', 'name slug level')
    .populate('cod.disabledCategories', 'name slug level')
    .populate('cartPoints.suggestions', 'name unit')
    .lean();
  ok(res, settings);
});

/* ============ Notification bell broadcasts ============ */

export const listNoticesAdmin = asyncHandler(async (_req, res) => {
  ok(res, await Notice.find().sort({ createdAt: -1 }).limit(100).lean());
});

export const createNotice = asyncHandler(async (req, res) => {
  const { message } = req.body as { message: string };
  created(res, await Notice.create({ message }));
});

export const deleteNotice = asyncHandler(async (req, res) => {
  const notice = await Notice.findByIdAndDelete(req.params.id);
  if (!notice) throw new ApiError(404, 'Notification not found');
  ok(res, { message: 'Notification deleted' });
});

/* ============ Chat with customer care ============ */

export const listTicketsAdmin = asyncHandler(async (req, res) => {
  const { status, page, limit } = req.query as unknown as { status?: string; page: number; limit: number };
  const filter = status ? { status } : {};
  const [tickets, total, unread] = await Promise.all([
    Ticket.find(filter)
      .sort({ lastMessageAt: -1 })
      .skip((page - 1) * limit)
      .limit(limit)
      .populate('user', 'name phone email')
      .lean(),
    Ticket.countDocuments(filter),
    Ticket.countDocuments({ adminUnread: { $gt: 0 } }),
  ]);
  ok(res, tickets, { ...pageMeta(page, limit, total), unread });
});

export const getTicketAdmin = asyncHandler(async (req, res) => {
  const ticket = await Ticket.findByIdAndUpdate(req.params.id, { $set: { adminUnread: 0 } }, { new: true })
    .populate('user', 'name phone email')
    .lean();
  if (!ticket) throw new ApiError(404, 'Chat not found');
  ok(res, ticket);
});

/** Each admin reply adds one to the customer's unread badge. */
export const replyTicketAdmin = asyncHandler(async (req, res) => {
  const { text } = req.body as { text: string };
  const ticket = await Ticket.findByIdAndUpdate(
    req.params.id,
    {
      $push: { messages: { from: 'admin', text, at: new Date() } },
      $inc: { customerUnread: 1 },
      $set: { adminUnread: 0, lastMessageAt: new Date() },
    },
    { new: true },
  )
    .populate('user', 'name phone email')
    .lean();
  if (!ticket) throw new ApiError(404, 'Chat not found');
  ok(res, ticket);
});

export const setTicketStatus = asyncHandler(async (req, res) => {
  const { status } = req.body as { status: 'open' | 'closed' };
  const ticket = await Ticket.findByIdAndUpdate(req.params.id, { $set: { status } }, { new: true }).lean();
  if (!ticket) throw new ApiError(404, 'Chat not found');
  ok(res, ticket);
});

/* ============ "Notify me" requests ============ */

export const listStockAlerts = asyncHandler(async (req, res) => {
  const { page, limit } = req.query as unknown as { page: number; limit: number };
  const [alerts, total] = await Promise.all([
    StockAlert.find()
      .sort({ createdAt: -1 })
      .skip((page - 1) * limit)
      .limit(limit)
      .populate('product', 'name slug unit stock images icon')
      .populate('user', 'name')
      .lean(),
    StockAlert.countDocuments(),
  ]);
  ok(res, alerts, pageMeta(page, limit, total));
});

export const updateStockAlert = asyncHandler(async (req, res) => {
  const { notified } = req.body as { notified: boolean };
  const alert = await StockAlert.findByIdAndUpdate(req.params.id, { $set: { notified } }, { new: true }).lean();
  if (!alert) throw new ApiError(404, 'Request not found');
  ok(res, alert);
});

export const deleteStockAlert = asyncHandler(async (req, res) => {
  const alert = await StockAlert.findByIdAndDelete(req.params.id);
  if (!alert) throw new ApiError(404, 'Request not found');
  ok(res, { message: 'Deleted' });
});

/* ============ Riders: online, COD, pause ============ */

/**
 * Riders with live status: online (app active in the last 2 minutes), COD
 * cash collected and not yet submitted, deliveries, cancellations, paused.
 */
export const listRidersAdmin = asyncHandler(async (req, res) => {
  const { q, online } = req.query as unknown as { q?: string; online?: boolean };
  const filter: Record<string, unknown> = { role: 'rider' };
  if (q) {
    const rx = { $regex: escapeRegex(q), $options: 'i' };
    filter.$or = [{ name: rx }, { phone: rx }, { email: rx }];
  }
  const since = new Date(Date.now() - ONLINE_WINDOW_MS);
  if (online) filter.lastSeenAt = { $gte: since };

  const riders = await User.find(filter)
    .sort({ lastSeenAt: -1, name: 1 })
    .select('name phone email warehouse isActive lastSeenAt lastLoginAt riderPaused riderPausedAt riderCancelCount riderLongDistance')
    .populate('warehouse', 'name')
    .lean();
  const cod = await codSummary(riders.map((r) => r._id as Types.ObjectId));

  const rows = riders.map((r) => {
    const c = cod.get(String(r._id));
    return {
      ...r,
      online: !!r.lastSeenAt && r.lastSeenAt >= since,
      codPending: c?.pending ?? 0,
      codCollected: c?.total ?? 0,
      deliveredCount: c?.deliveries ?? 0,
      cancelledCount: r.riderCancelCount ?? 0,
      paused: !!r.riderPaused,
      longDistance: !!r.riderLongDistance,
    };
  });
  const totals = rows.reduce(
    (t, r) => ({ codPending: t.codPending + r.codPending, codCollected: t.codCollected + r.codCollected, online: t.online + (r.online ? 1 : 0) }),
    { codPending: 0, codCollected: 0, online: 0 },
  );
  const { riderCodLimit } = await getSettingsDoc();
  ok(res, rows, { totals, codLimit: riderCodLimit ?? 2000 });
});

export const setRiderPaused = asyncHandler(async (req, res) => {
  const { paused } = req.body as { paused: boolean };
  const rider = await User.findOneAndUpdate(
    { _id: req.params.id, role: 'rider' },
    { $set: { riderPaused: paused, riderPausedAt: paused ? new Date() : null } },
    { new: true },
  )
    .select('name riderPaused riderPausedAt')
    .lean();
  if (!rider) throw new ApiError(404, 'Rider not found');
  ok(res, rider);
});

/** The rider handed their COD cash to the cash department: clear what they owe. */
export const settleRiderCod = asyncHandler(async (req, res) => {
  const result = await Order.updateMany(
    { rider: req.params.id, status: 'delivered', paymentMethod: 'cod', codSettled: { $ne: true } },
    { $set: { codSettled: true } },
  );
  ok(res, { settledOrders: result.modifiedCount });
});

/* ============ Dashboard bell ============ */

export const listAdminAlerts = asyncHandler(async (_req, res) => {
  const [alerts, unread] = await Promise.all([
    AdminAlert.find().sort({ createdAt: -1 }).limit(30).populate('rider', 'name email').lean(),
    AdminAlert.countDocuments({ read: false }),
  ]);
  ok(res, alerts, { unread });
});

export const readAdminAlerts = asyncHandler(async (_req, res) => {
  await AdminAlert.updateMany({ read: false }, { $set: { read: true } });
  ok(res, { message: 'Marked as read' });
});

/* ============ Orders search by rider ============ */

/** Order ids filter for "search by delivery boy name" on the Orders page. */
export async function riderFilter(name?: string): Promise<FilterQuery<IOrder> | null> {
  if (!name) return null;
  const riders = await User.find({ role: 'rider', name: { $regex: escapeRegex(name), $options: 'i' } }).select('_id').lean();
  return { rider: { $in: riders.map((r) => r._id) } };
}

/* ============ Contact-form submissions ============ */

export const listEnquiries = asyncHandler(async (req, res) => {
  const { kind, page, limit } = req.query as unknown as { kind?: string; page: number; limit: number };
  const filter = kind ? { kind } : {};
  const [rows, total] = await Promise.all([
    Enquiry.find(filter).sort({ createdAt: -1 }).skip((page - 1) * limit).limit(limit).lean(),
    Enquiry.countDocuments(filter),
  ]);
  ok(res, rows, pageMeta(page, limit, total));
});

export const deleteEnquiry = asyncHandler(async (req, res) => {
  await Enquiry.deleteOne({ _id: req.params.id });
  ok(res, { deleted: true });
});

/** A long-distance rider is the only one who sees orders beyond the last distance band. */
export const setRiderLongDistance = asyncHandler(async (req, res) => {
  const { longDistance } = req.body as { longDistance: boolean };
  const rider = await User.findOneAndUpdate({ _id: req.params.id, role: 'rider' }, { $set: { riderLongDistance: longDistance } }, { new: true })
    .select('name riderLongDistance')
    .lean();
  if (!rider) throw new ApiError(404, 'Rider not found');
  ok(res, rider);
});

/* ============ Standard categories: home-screen rows pinned to the top or bottom ============ */

export const listStandardCategories = asyncHandler(async (_req, res) => {
  const rows = await StandardCategory.find().sort({ position: 1, sortOrder: 1, name: 1 }).lean();
  const counts = await Product.aggregate<{ _id: Types.ObjectId; n: number }>([
    { $match: { standardCategories: { $in: rows.map((r) => r._id) } } },
    { $unwind: '$standardCategories' },
    { $group: { _id: '$standardCategories', n: { $sum: 1 } } },
  ]);
  const byId = new Map(counts.map((c) => [String(c._id), c.n]));
  ok(res, rows.map((r) => ({ ...r, products: byId.get(String(r._id)) ?? 0 })));
});

export const createStandardCategory = asyncHandler(async (req, res) => {
  const row = await StandardCategory.create(req.body);
  clearCatalogCache();
  created(res, row);
});

export const updateStandardCategory = asyncHandler(async (req, res) => {
  const row = await StandardCategory.findByIdAndUpdate(req.params.id, req.body, { new: true, runValidators: true });
  if (!row) throw new ApiError(404, 'Standard category not found');
  clearCatalogCache();
  ok(res, row);
});

export const deleteStandardCategory = asyncHandler(async (req, res) => {
  const row = await StandardCategory.findByIdAndDelete(req.params.id);
  if (!row) throw new ApiError(404, 'Standard category not found');
  await Product.updateMany({ standardCategories: row._id }, { $pull: { standardCategories: row._id } });
  clearCatalogCache();
  ok(res, { deleted: true });
});

/* ============ Integrations: Google / Facebook login and Razorpay, set from the admin panel ============ */

/** What the panel shows: ids in full, secrets only as "saved". */
async function integrationsView() {
  const doc = await Integrations.findOne({ key: 'global' }).lean();
  const live = await getIntegrations();
  return {
    googleClientId: doc?.google?.clientId ?? '',
    facebookAppId: doc?.facebook?.appId ?? '',
    facebookSecretSaved: !!doc?.facebook?.appSecretEnc,
    razorpayKeyId: doc?.razorpay?.keyId ?? '',
    razorpaySecretSaved: !!doc?.razorpay?.keySecretEnc,
    razorpayEnabled: doc?.razorpay?.enabled ?? true,
    /** Whether each one is actually working for customers right now (the .env file counts too). */
    live: { google: !!live.googleClientId, facebook: !!(live.facebookAppId && live.facebookAppSecret), razorpay: !!(await razorpayKeys()) },
  };
}

export const getIntegrationsAdmin = asyncHandler(async (_req, res) => {
  ok(res, await integrationsView());
});

export const updateIntegrationsAdmin = asyncHandler(async (req, res) => {
  const b = req.body as {
    googleClientId?: string;
    facebookAppId?: string;
    facebookAppSecret?: string;
    clearFacebookSecret?: boolean;
    razorpayKeyId?: string;
    razorpayKeySecret?: string;
    clearRazorpaySecret?: boolean;
    razorpayEnabled?: boolean;
  };
  const set: Record<string, unknown> = {};
  const unset: Record<string, 1> = {};
  if (b.googleClientId !== undefined) set['google.clientId'] = b.googleClientId;
  if (b.facebookAppId !== undefined) set['facebook.appId'] = b.facebookAppId;
  if (b.facebookAppSecret) set['facebook.appSecretEnc'] = seal(b.facebookAppSecret);
  else if (b.clearFacebookSecret) unset['facebook.appSecretEnc'] = 1;
  if (b.razorpayKeyId !== undefined) set['razorpay.keyId'] = b.razorpayKeyId;
  if (b.razorpayKeySecret) set['razorpay.keySecretEnc'] = seal(b.razorpayKeySecret);
  else if (b.clearRazorpaySecret) unset['razorpay.keySecretEnc'] = 1;
  if (b.razorpayEnabled !== undefined) set['razorpay.enabled'] = b.razorpayEnabled;
  await Integrations.updateOne(
    { key: 'global' },
    { ...(Object.keys(set).length ? { $set: set } : {}), ...(Object.keys(unset).length ? { $unset: unset } : {}) },
    { upsert: true },
  );
  invalidateIntegrations();
  clearCatalogCache(); // the public settings carry the on/off flags and the public ids
  ok(res, await integrationsView());
});

/** Checks the saved Razorpay keys against Razorpay itself, so a typo is caught before a customer pays. */
export const testRazorpayAdmin = asyncHandler(async (_req, res) => {
  const keys = await razorpayKeys();
  if (!keys) throw new ApiError(400, 'Save the Razorpay Key ID and Key Secret first.');
  await testRazorpayKeys(keys);
  ok(res, { ok: true, message: 'Razorpay accepted these keys.' });
});
