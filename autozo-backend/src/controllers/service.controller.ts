import crypto from 'crypto';
import { Types } from 'mongoose';
import { Service } from '../models/Service';
import { ServiceCategory } from '../models/ServiceCategory';
import { ServiceBooking, BOOKING_CUSTOMER_CANCELLABLE } from '../models/ServiceBooking';
import { User } from '../models/User';
import { ApiError } from '../utils/ApiError';
import { asyncHandler } from '../utils/asyncHandler';
import { created, ok, pageMeta } from '../utils/response';
import { idOrSlugFilter } from '../utils/helpers';
import { cancelDispatch, startBookingDispatch } from '../services/dispatch.service';
import { pushToUsers } from '../services/firebase.service';
import { createRazorpayOrder, razorpayEnabled, razorpayKeys, verifyRazorpaySignature } from '../services/razorpay.service';

function newBookingNumber(): string {
  const d = new Date();
  const ymd = `${String(d.getFullYear()).slice(2)}${String(d.getMonth() + 1).padStart(2, '0')}${String(d.getDate()).padStart(2, '0')}`;
  return `SB${ymd}-${crypto.randomBytes(3).toString('hex').toUpperCase()}`;
}

/* ============ Public catalog ============ */

export const listCategories = asyncHandler(async (_req, res) => {
  const rows = await ServiceCategory.find({ isActive: true }).sort({ sort: 1, name: 1 }).lean();
  ok(res, rows);
});

export const listServices = asyncHandler(async (req, res) => {
  const { page, limit, category, q, lat, lng, maxKm } = req.query as unknown as {
    page: number; limit: number; category?: string; q?: string; lat?: number; lng?: number; maxKm?: number;
  };
  const filter: Record<string, unknown> = { isActive: true };
  if (category) {
    const cat = await ServiceCategory.findOne(idOrSlugFilter(category)).select('_id').lean();
    filter.category = cat?._id ?? new Types.ObjectId();
  }
  if (q) filter.$text = { $search: q };

  // Location-aware ranking when the customer shares where they are.
  if (lat != null && lng != null) {
    const rows = await Service.aggregate([
      {
        $geoNear: {
          near: { type: 'Point', coordinates: [lng, lat] },
          distanceField: 'distM',
          maxDistance: (maxKm ?? 25) * 1000,
          spherical: true,
          query: filter,
        },
      },
      { $skip: (page - 1) * limit },
      { $limit: limit },
    ]);
    const withCat = await Service.populate(rows, [{ path: 'category', select: 'name slug' }, { path: 'provider', select: 'name providerId' }]);
    return ok(res, withCat, pageMeta(page, limit, withCat.length + (page - 1) * limit));
  }

  const [rows, total] = await Promise.all([
    Service.find(filter).sort({ bookingCount: -1, createdAt: -1 }).skip((page - 1) * limit).limit(limit)
      .populate('category', 'name slug').populate('provider', 'name providerId').lean(),
    Service.countDocuments(filter),
  ]);
  ok(res, rows, pageMeta(page, limit, total));
});

export const getService = asyncHandler(async (req, res) => {
  const service = await Service.findOne({ ...idOrSlugFilter(req.params.idOrSlug), isActive: true })
    .populate('category', 'name slug').populate('provider', 'name providerId').lean();
  if (!service) throw new ApiError(404, 'Service not found');
  ok(res, service);
});

/* ============ Customer bookings ============ */

export const createBooking = asyncHandler(async (req, res) => {
  const b = req.body as {
    serviceId: string; scheduledAt?: string; note?: string; paymentMethod: 'cod' | 'online';
    address: { name: string; phone: string; line1: string; line2?: string; landmark?: string; city: string; state: string; pincode: string; location?: { lat: number; lng: number } };
  };
  const service = await Service.findOne({ _id: b.serviceId, isActive: true }).lean();
  if (!service) throw new ApiError(404, 'This service is not available right now.');
  const provider = await User.findOne({ _id: service.provider, role: 'provider', providerStatus: 'approved', isActive: true }).select('_id').lean();
  if (!provider) throw new ApiError(409, 'This provider is not accepting bookings right now.');
  if (b.paymentMethod === 'online' && !(await razorpayEnabled())) throw new ApiError(400, 'Online payment is not switched on. Please choose pay-after-service.');

  const booking = await ServiceBooking.create({
    bookingNumber: newBookingNumber(),
    customer: req.user!.id,
    service: service._id,
    category: service.category,
    provider: service.provider,
    snapshot: { title: service.title, image: service.images?.[0], price: service.price, priceUnit: service.priceUnit, durationMins: service.durationMins },
    scheduledAt: b.scheduledAt ? new Date(b.scheduledAt) : undefined,
    address: b.address,
    price: service.price,
    paymentMethod: b.paymentMethod,
    note: b.note,
    completionOtp: String(crypto.randomInt(1000, 10000)),
    status: 'requested',
    statusHistory: [{ status: 'requested', at: new Date(), by: 'customer' }],
  });
  await Service.updateOne({ _id: service._id }, { $inc: { bookingCount: 1 } });

  // Online: take payment first, then ring providers once it is verified.
  if (b.paymentMethod === 'online') {
    const rzp = await createRazorpayOrder(service.price, booking.bookingNumber, { bookingId: String(booking._id) });
    booking.razorpayOrderId = rzp.id;
    await booking.save();
    return created(res, {
      requiresPayment: true,
      bookingId: String(booking._id),
      razorpayOrderId: rzp.id,
      amount: rzp.amount,
      currency: rzp.currency,
      keyId: (await razorpayKeys())!.keyId,
    });
  }

  // Cash: start ringing nearby providers now (the original provider first).
  await startBookingDispatch(booking._id);
  void pushToUsers([String(req.user!.id)], {
    title: 'Booking placed',
    body: `Booking ${booking.bookingNumber} for "${service.title}" is placed. Your completion OTP is ${booking.completionOtp}. We're finding a provider now.`,
    data: { type: 'booking_placed', bookingId: String(booking._id), url: `/bookings/${String(booking._id)}` },
  });
  created(res, booking);
});

/** Verify a Razorpay payment for an online booking, then start ringing providers. */
export const confirmBookingPayment = asyncHandler(async (req, res) => {
  const { razorpay_order_id, razorpay_payment_id, razorpay_signature } = req.body as {
    razorpay_order_id: string; razorpay_payment_id: string; razorpay_signature: string;
  };
  if (!(await razorpayEnabled())) throw new ApiError(400, 'Online payment is not switched on.');
  if (!(await verifyRazorpaySignature(razorpay_order_id, razorpay_payment_id, razorpay_signature))) {
    throw new ApiError(400, 'We could not verify this payment. If money was deducted it will be refunded.');
  }
  const booking = await ServiceBooking.findOneAndUpdate(
    { razorpayOrderId: razorpay_order_id, customer: req.user!.id, paymentStatus: 'pending' },
    { $set: { paymentStatus: 'paid', paymentRef: razorpay_payment_id } },
    { new: true },
  );
  if (!booking) throw new ApiError(404, 'No pending booking found for this payment.');
  // Now that it is paid, start ringing providers (guard against a double confirm).
  if (!booking.dispatch) await startBookingDispatch(booking._id);
  void pushToUsers([String(req.user!.id)], {
    title: 'Payment received',
    body: `Payment confirmed for booking ${booking.bookingNumber}. We're finding a provider now.`,
    data: { type: 'booking_paid', bookingId: String(booking._id), url: `/bookings/${String(booking._id)}` },
  });
  created(res, booking);
});

export const listMyBookings = asyncHandler(async (req, res) => {
  const { page, limit, status } = req.query as unknown as { page: number; limit: number; status?: string };
  const filter: Record<string, unknown> = { customer: req.user!.id };
  if (status) filter.status = status;
  const [rows, total] = await Promise.all([
    ServiceBooking.find(filter).sort({ createdAt: -1 }).skip((page - 1) * limit).limit(limit)
      .populate('provider', 'name phone providerId').populate('service', 'title').lean(),
    ServiceBooking.countDocuments(filter),
  ]);
  ok(res, rows, pageMeta(page, limit, total));
});

export const getMyBooking = asyncHandler(async (req, res) => {
  const b = await ServiceBooking.findOne({ _id: req.params.id, customer: req.user!.id })
    .populate('provider', 'name phone providerId').populate('service', 'title').lean();
  if (!b) throw new ApiError(404, 'Booking not found');
  ok(res, b);
});

export const cancelBooking = asyncHandler(async (req, res) => {
  const { reason } = req.body as { reason?: string };
  const booking = await ServiceBooking.findOne({ _id: req.params.id, customer: req.user!.id });
  if (!booking) throw new ApiError(404, 'Booking not found');
  if (!BOOKING_CUSTOMER_CANCELLABLE.includes(booking.status)) throw new ApiError(409, 'This booking can no longer be cancelled.');
  const hadProvider = ['accepted', 'on_the_way'].includes(booking.status);
  booking.status = 'cancelled';
  booking.cancelledBy = 'customer';
  booking.cancelReason = reason;
  booking.statusHistory.push({ status: 'cancelled', at: new Date(), by: 'customer', note: reason });
  if (booking.paymentStatus === 'paid') booking.paymentStatus = 'refund_pending';
  await booking.save();
  await cancelDispatch({ booking: booking._id });
  if (hadProvider) {
    await User.updateOne({ _id: booking.provider }, { $set: { providerBusy: false } });
    void pushToUsers([String(booking.provider)], {
      title: 'Booking cancelled',
      body: `Booking ${booking.bookingNumber} was cancelled by the customer.`,
      data: { type: 'booking_cancelled', bookingId: String(booking._id), url: '/' },
    });
  }
  ok(res, { cancelled: true });
});

export const rateBooking = asyncHandler(async (req, res) => {
  const { rating, comment } = req.body as { rating: number; comment?: string };
  const booking = await ServiceBooking.findOne({ _id: req.params.id, customer: req.user!.id });
  if (!booking) throw new ApiError(404, 'Booking not found');
  if (booking.status !== 'completed') throw new ApiError(409, 'You can only rate a completed booking.');
  const prev = booking.rating;
  booking.rating = rating;
  booking.reviewComment = comment;
  await booking.save();
  // Fold the rating into the service's running average.
  if (!prev) {
    await Service.updateOne({ _id: booking.service }, [
      {
        $set: {
          rating: { $round: [{ $divide: [{ $add: [{ $multiply: ['$rating', '$ratingCount'] }, rating] }, { $add: ['$ratingCount', 1] }] }, 2] },
          ratingCount: { $add: ['$ratingCount', 1] },
        },
      },
    ]);
  }
  ok(res, { rated: true });
});
