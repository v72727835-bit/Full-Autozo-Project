import crypto from 'crypto';
import { Types } from 'mongoose';
import { AdminAlert } from '../models/AdminAlert';
import { Service } from '../models/Service';
import { ServiceBooking, BookingStatus } from '../models/ServiceBooking';
import { ServiceCategory } from '../models/ServiceCategory';
import { User } from '../models/User';
import { ApiError } from '../utils/ApiError';
import { asyncHandler } from '../utils/asyncHandler';
import { created, ok, pageMeta } from '../utils/response';
import { signAccessToken, signRefreshToken, sha256 } from '../utils/jwt';
import {
  acceptDispatch,
  cancelDispatch,
  declineDispatch,
  reopenDispatch,
  ringingForUser,
} from '../services/dispatch.service';
import { pushToUsers } from '../services/firebase.service';

/** A booking a provider may still act on while they hold it. */
const PROVIDER_FORWARD: Record<string, BookingStatus> = {
  accepted: 'on_the_way',
  on_the_way: 'in_progress',
  in_progress: 'completed',
};

const genId = () => `SP${crypto.randomBytes(3).toString('hex').toUpperCase()}`;

/* ============ Registration & login ============ */

export const registerProvider = asyncHandler(async (req, res) => {
  const b = req.body as {
    name: string; phone: string; email?: string; password: string; firm: string; category?: string;
    line1: string; city: string; state: string; pincode: string; location: { lat: number; lng: number }; about?: string;
  };
  const clash = await User.findOne({ role: 'provider', $or: [{ phone: b.phone }, ...(b.email ? [{ email: b.email }] : [])] }).select('_id').lean();
  if (clash) throw new ApiError(409, 'That phone or email is already registered');
  const user = await User.create({
    name: b.name, phone: b.phone, email: b.email, password: b.password, role: 'provider', providerStatus: 'pending',
    providerApplication: {
      firm: b.firm, category: b.category, line1: b.line1, city: b.city, state: b.state, pincode: b.pincode,
      lat: b.location.lat, lng: b.location.lng, about: b.about, submittedAt: new Date(),
    },
    providerLocation: { type: 'Point', coordinates: [b.location.lng, b.location.lat] },
  });
  await AdminAlert.create({ type: 'provider_registered', message: `New service provider "${b.firm}" (${b.city}) registered and is waiting for approval`, user: user._id });
  created(res, { message: 'Registration received. You can log in and add services once the Autozo team approves it.' });
});

export const providerLogin = asyncHandler(async (req, res) => {
  const { identifier, password } = req.body as { identifier: string; password: string };
  const query = identifier.includes('@')
    ? { email: identifier.toLowerCase(), role: 'provider' }
    : { phone: identifier.replace(/[\s-]/g, '').replace(/^(\+91|91)(?=\d{10}$)/, ''), role: 'provider' };
  const user = await User.findOne(query).select('+password');
  if (!user || !(await user.comparePassword(password))) throw new ApiError(401, 'Invalid phone/email or password');
  if (!user.isActive) throw new ApiError(403, 'Your account has been disabled. Please contact support.');
  if (user.providerStatus === 'pending') throw new ApiError(403, 'Your registration is waiting for approval. We will let you in as soon as the Autozo team approves it.');
  if (user.providerStatus === 'rejected') throw new ApiError(403, `Your registration was not approved${user.providerRejectReason ? `: ${user.providerRejectReason}` : '.'} Please contact support.`);
  const accessToken = signAccessToken(user.id, user.role);
  const refreshToken = signRefreshToken(user.id);
  await User.updateOne(
    { _id: user._id },
    { $push: { refreshTokens: { $each: [{ hash: sha256(refreshToken), createdAt: new Date() }], $slice: -5 } }, $set: { lastLoginAt: new Date() } },
  );
  ok(res, { user, accessToken, refreshToken });
});

/* ============ Profile & dashboard ============ */

export const getMe = asyncHandler(async (req, res) => {
  const user = await User.findById(req.user!.id).select('name phone email providerId providerStatus providerApplication providerBusy providerOnlineAt');
  if (!user) throw new ApiError(404, 'Account not found');
  if (!user.providerId) {
    for (let i = 0; !user.providerId && i < 5; i++) {
      const candidate = genId();
      if (!(await User.exists({ providerId: candidate }))) user.providerId = candidate;
    }
    await user.save();
  }
  ok(res, user);
});

export const dashboard = asyncHandler(async (req, res) => {
  const id = new Types.ObjectId(req.user!.id);
  const start = new Date(); start.setHours(0, 0, 0, 0);
  const [services, activeServices, byStatus, todays, earnRows] = await Promise.all([
    Service.countDocuments({ provider: id }),
    Service.countDocuments({ provider: id, isActive: true }),
    ServiceBooking.aggregate<{ _id: string; n: number }>([{ $match: { provider: id } }, { $group: { _id: '$status', n: { $sum: 1 } } }]),
    ServiceBooking.countDocuments({ provider: id, createdAt: { $gte: start } }),
    ServiceBooking.aggregate<{ _id: null; total: number }>([
      { $match: { provider: id, status: 'completed' } },
      { $group: { _id: null, total: { $sum: '$providerEarning' } } },
    ]),
  ]);
  const counts: Record<string, number> = {};
  for (const r of byStatus) counts[r._id] = r.n;
  ok(res, {
    totalServices: services,
    activeServices,
    bookings: Object.values(counts).reduce((a, b) => a + b, 0),
    bookingsByStatus: counts,
    todaysBookings: todays,
    earnings: Math.round(earnRows[0]?.total ?? 0),
  });
});

/** Go online/offline (available to receive rings). Also refreshes the online timestamp. */
export const setAvailability = asyncHandler(async (req, res) => {
  const { available } = req.body as { available: boolean };
  await User.updateOne({ _id: req.user!.id }, { $set: { providerBusy: !available, providerOnlineAt: new Date() } });
  ok(res, { available });
});

/* ============ Service listings (CRUD) ============ */

async function requireApproved(userId: string) {
  const u = await User.findById(userId).select('providerStatus providerLocation').lean();
  if (!u || u.providerStatus !== 'approved') throw new ApiError(403, 'Your account must be approved before you can add or manage services.');
  return u;
}

export const listMyServices = asyncHandler(async (req, res) => {
  const rows = await Service.find({ provider: req.user!.id }).sort({ createdAt: -1 }).populate('category', 'name slug').lean();
  ok(res, rows);
});

export const createService = asyncHandler(async (req, res) => {
  const u = await requireApproved(req.user!.id);
  const b = req.body as Record<string, unknown>;
  const coords = (u.providerLocation?.coordinates as [number, number]) ?? [0, 0];
  const service = await Service.create({
    ...b,
    provider: req.user!.id,
    location: { type: 'Point', coordinates: coords },
  });
  created(res, service);
});

export const updateService = asyncHandler(async (req, res) => {
  await requireApproved(req.user!.id);
  const service = await Service.findOneAndUpdate(
    { _id: req.params.id, provider: req.user!.id },
    { $set: req.body as Record<string, unknown> },
    { new: true, runValidators: true },
  );
  if (!service) throw new ApiError(404, 'Service not found');
  ok(res, service);
});

export const deleteService = asyncHandler(async (req, res) => {
  const open = await ServiceBooking.exists({
    service: req.params.id,
    status: { $in: ['requested', 'accepted', 'on_the_way', 'in_progress'] },
  });
  if (open) {
    // Can't remove a service with live bookings; hide it instead.
    const s = await Service.findOneAndUpdate({ _id: req.params.id, provider: req.user!.id }, { $set: { isActive: false } }, { new: true });
    if (!s) throw new ApiError(404, 'Service not found');
    return ok(res, { deactivated: true, message: 'This service has live bookings, so it was hidden instead of deleted.' });
  }
  const r = await Service.deleteOne({ _id: req.params.id, provider: req.user!.id });
  if (!r.deletedCount) throw new ApiError(404, 'Service not found');
  ok(res, { deleted: true });
});

/* ============ Bookings (provider side) ============ */

export const listMyBookings = asyncHandler(async (req, res) => {
  const { page, limit, status } = req.query as unknown as { page: number; limit: number; status?: string };
  const filter: Record<string, unknown> = { provider: req.user!.id };
  if (status) filter.status = status;
  const [rows, total] = await Promise.all([
    ServiceBooking.find(filter).sort({ createdAt: -1 }).skip((page - 1) * limit).limit(limit)
      .populate('customer', 'name phone').populate('service', 'title').lean(),
    ServiceBooking.countDocuments(filter),
  ]);
  ok(res, rows, pageMeta(page, limit, total));
});

export const getMyBooking = asyncHandler(async (req, res) => {
  const b = await ServiceBooking.findOne({ _id: req.params.id, provider: req.user!.id })
    .populate('customer', 'name phone').populate('service', 'title').lean();
  if (!b) throw new ApiError(404, 'Booking not found');
  ok(res, b);
});

/** Move a held booking forward: accepted → on_the_way → in_progress → completed (OTP). */
export const setBookingStatus = asyncHandler(async (req, res) => {
  const { status, otp } = req.body as { status: BookingStatus; otp?: string };
  const booking = await ServiceBooking.findOne({ _id: req.params.id, provider: req.user!.id });
  if (!booking) throw new ApiError(404, 'Booking not found');
  if (PROVIDER_FORWARD[booking.status] !== status) throw new ApiError(409, `You can't move this booking to "${status}" from "${booking.status}".`);
  if (status === 'completed') {
    if (!otp || otp !== booking.completionOtp) throw new ApiError(400, 'Ask the customer for the completion OTP to close this booking.');
    booking.completedAt = new Date();
    booking.providerEarning = booking.price;
    await User.updateOne({ _id: req.user!.id }, { $set: { providerBusy: false } });
  }
  booking.status = status;
  booking.statusHistory.push({ status, at: new Date(), by: 'provider' });
  await booking.save();
  void pushToUsers([String(booking.customer)], {
    title: `Booking ${status.replace(/_/g, ' ')}`,
    body: `Your booking ${booking.bookingNumber} is now ${status.replace(/_/g, ' ')}.`,
    data: { type: `booking_${status}`, bookingId: String(booking._id), url: `/bookings/${String(booking._id)}` },
  });
  ok(res, booking);
});

/** Provider drops a booking they had: ring the next-nearest providers instead. */
export const cancelMyBooking = asyncHandler(async (req, res) => {
  const { reason } = req.body as { reason?: string };
  const booking = await ServiceBooking.findOne({ _id: req.params.id, provider: req.user!.id });
  if (!booking) throw new ApiError(404, 'Booking not found');
  if (!['accepted', 'on_the_way', 'in_progress'].includes(booking.status)) throw new ApiError(409, 'This booking can no longer be cancelled.');
  booking.status = 'requested';
  booking.statusHistory.push({ status: 'requested', at: new Date(), by: 'provider', note: reason || 'Provider cancelled — searching again' });
  await booking.save();
  await User.updateOne({ _id: req.user!.id }, { $set: { providerBusy: false } });
  if (booking.dispatch) {
    await reopenDispatch(String(booking.dispatch), req.user!.id, `${booking.snapshot.title} ${booking.bookingNumber} needs a provider.`);
  } else {
    const { startBookingDispatch } = await import('../services/dispatch.service');
    await startBookingDispatch(booking._id);
  }
  void pushToUsers([String(booking.customer)], {
    title: 'Finding you another provider',
    body: `Your provider is unavailable for booking ${booking.bookingNumber}. We're finding a nearby replacement.`,
    data: { type: 'booking_reassigning', bookingId: String(booking._id), url: `/bookings/${String(booking._id)}` },
  });
  ok(res, { reassigning: true });
});

/* ============ Ring (persistent bell) ============ */

export const myRing = asyncHandler(async (req, res) => {
  ok(res, await ringingForUser(req.user!.id));
});

export const acceptRing = asyncHandler(async (req, res) => {
  await requireApproved(req.user!.id);
  const result = await acceptDispatch(req.params.dispatchId, req.user!.id);
  if (!result || !result.bookingId) throw new ApiError(409, 'This booking was already taken by someone else.');
  const booking = await ServiceBooking.findById(result.bookingId);
  if (!booking) throw new ApiError(404, 'Booking not found');
  booking.provider = new Types.ObjectId(req.user!.id);
  booking.status = 'accepted';
  booking.acceptedAt = new Date();
  booking.statusHistory.push({ status: 'accepted', at: new Date(), by: 'provider' });
  await booking.save();
  await User.updateOne({ _id: req.user!.id }, { $set: { providerBusy: true } });
  void pushToUsers([String(booking.customer)], {
    title: 'Provider assigned',
    body: `A provider accepted your booking ${booking.bookingNumber} and will be in touch.`,
    data: { type: 'booking_accepted', bookingId: String(booking._id), url: `/bookings/${String(booking._id)}` },
  });
  ok(res, booking);
});

export const declineRing = asyncHandler(async (req, res) => {
  await declineDispatch(req.params.dispatchId, req.user!.id);
  ok(res, { declined: true });
});

/* ============ Admin: approve providers ============ */

export const adminListProviders = asyncHandler(async (req, res) => {
  const { page, limit, status } = req.query as unknown as { page: number; limit: number; status?: string };
  const filter = { role: 'provider', providerStatus: status ?? { $in: ['pending', 'approved', 'rejected'] } };
  const [rows, total, pending] = await Promise.all([
    User.find(filter).sort({ createdAt: -1 }).skip((page - 1) * limit).limit(limit)
      .select('name phone email providerId providerStatus providerRejectReason providerApplication createdAt').lean(),
    User.countDocuments(filter),
    User.countDocuments({ role: 'provider', providerStatus: 'pending' }),
  ]);
  ok(res, rows, { ...pageMeta(page, limit, total), pending });
});

export const adminApproveProvider = asyncHandler(async (req, res) => {
  const user = await User.findOne({ _id: req.params.id, role: 'provider', providerStatus: { $in: ['pending', 'rejected'] } });
  if (!user) throw new ApiError(404, 'Registration not found');
  user.providerStatus = 'approved';
  user.providerRejectReason = undefined;
  await user.save();
  await AdminAlert.updateMany({ type: 'provider_registered', user: user._id }, { $set: { read: true } });
  ok(res, { approved: true });
});

export const adminRejectProvider = asyncHandler(async (req, res) => {
  const { reason } = req.body as { reason: string };
  const r = await User.updateOne({ _id: req.params.id, role: 'provider', providerStatus: 'pending' }, { $set: { providerStatus: 'rejected', providerRejectReason: reason } });
  if (!r.matchedCount) throw new ApiError(404, 'Pending registration not found');
  await AdminAlert.updateMany({ type: 'provider_registered', user: req.params.id }, { $set: { read: true } });
  ok(res, { rejected: true });
});

/** Admin creates an already-approved provider with a login (phone + password), like a seller/rider. */
export const adminCreateProvider = asyncHandler(async (req, res) => {
  const b = req.body as {
    name: string; phone: string; email?: string; password: string; firm: string; category?: string;
    line1?: string; city?: string; state?: string; pincode?: string; location?: { lat: number; lng: number };
  };
  const clash = await User.findOne({ role: 'provider', $or: [{ phone: b.phone }, ...(b.email ? [{ email: b.email }] : [])] }).select('_id').lean();
  if (clash) throw new ApiError(409, 'That phone or email is already registered as a provider');
  let providerId: string | undefined;
  for (let i = 0; !providerId && i < 5; i++) {
    const candidate = genId();
    if (!(await User.exists({ providerId: candidate }))) providerId = candidate;
  }
  const user = await User.create({
    name: b.name, phone: b.phone, email: b.email, password: b.password, role: 'provider',
    providerStatus: 'approved', providerId,
    providerApplication: b.firm
      ? { firm: b.firm, category: b.category, line1: b.line1 ?? '', city: b.city ?? '', state: b.state ?? '', pincode: b.pincode ?? '', lat: b.location?.lat ?? 0, lng: b.location?.lng ?? 0, submittedAt: new Date() }
      : undefined,
    providerLocation: b.location ? { type: 'Point', coordinates: [b.location.lng, b.location.lat] } : undefined,
  });
  created(res, { _id: user._id, name: user.name, phone: user.phone, email: user.email, providerId: user.providerId });
});

/* ============ Admin: service categories ============ */

export const adminListCategories = asyncHandler(async (_req, res) => {
  const rows = await ServiceCategory.find().sort({ sort: 1, name: 1 }).lean();
  ok(res, rows);
});

export const adminCreateCategory = asyncHandler(async (req, res) => {
  const cat = await ServiceCategory.create(req.body as Record<string, unknown>);
  created(res, cat);
});

export const adminUpdateCategory = asyncHandler(async (req, res) => {
  const cat = await ServiceCategory.findByIdAndUpdate(req.params.id, { $set: req.body as Record<string, unknown> }, { new: true, runValidators: true });
  if (!cat) throw new ApiError(404, 'Category not found');
  ok(res, cat);
});

export const adminDeleteCategory = asyncHandler(async (req, res) => {
  const inUse = await Service.exists({ category: req.params.id });
  if (inUse) {
    const cat = await ServiceCategory.findByIdAndUpdate(req.params.id, { $set: { isActive: false } }, { new: true });
    if (!cat) throw new ApiError(404, 'Category not found');
    return ok(res, { deactivated: true, message: 'This category has services, so it was hidden instead of deleted.' });
  }
  const r = await ServiceCategory.deleteOne({ _id: req.params.id });
  if (!r.deletedCount) throw new ApiError(404, 'Category not found');
  ok(res, { deleted: true });
});

/* ============ Admin: bookings overview ============ */

export const adminListBookings = asyncHandler(async (req, res) => {
  const { page, limit, status } = req.query as unknown as { page: number; limit: number; status?: string };
  const filter: Record<string, unknown> = {};
  if (status) filter.status = status;
  const [rows, total] = await Promise.all([
    ServiceBooking.find(filter).sort({ createdAt: -1 }).skip((page - 1) * limit).limit(limit)
      .populate('customer', 'name phone').populate('provider', 'name phone providerId').populate('service', 'title').lean(),
    ServiceBooking.countDocuments(filter),
  ]);
  ok(res, rows, pageMeta(page, limit, total));
});
