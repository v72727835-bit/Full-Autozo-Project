import { Schema, Types, model } from 'mongoose';

export const BOOKING_STATUSES = [
  'requested', // customer placed it; dispatch is ringing providers
  'accepted', // a provider accepted it
  'on_the_way', // provider is travelling to the customer
  'in_progress', // work has started
  'completed', // work finished (verified with OTP)
  'cancelled', // cancelled by customer/provider/admin
  'rejected', // no provider accepted / declined
  'expired', // dispatch ran out of providers
] as const;
export type BookingStatus = (typeof BOOKING_STATUSES)[number];

/** Statuses from which a customer may still cancel. */
export const BOOKING_CUSTOMER_CANCELLABLE: BookingStatus[] = ['requested', 'accepted', 'on_the_way'];

export const BOOKING_PAYMENT_METHODS = ['cod', 'online'] as const;
export type BookingPaymentMethod = (typeof BOOKING_PAYMENT_METHODS)[number];

export const BOOKING_PAYMENT_STATUSES = ['pending', 'paid', 'failed', 'refund_pending', 'refunded'] as const;
export type BookingPaymentStatus = (typeof BOOKING_PAYMENT_STATUSES)[number];

/**
 * A customer's request for one service. Created the moment the customer books;
 * a Dispatch then rings nearby providers until one accepts. The booking carries
 * a snapshot of the service (title/price) so an old booking never changes when
 * the provider later edits the listing.
 */
export interface IServiceBooking {
  bookingNumber: string;
  customer: Types.ObjectId;
  service: Types.ObjectId;
  category: Types.ObjectId;
  /** The provider who owns the listing. Set at creation. */
  provider: Types.ObjectId;
  /** Snapshot taken at booking time. */
  snapshot: { title: string; image?: string; price: number; priceUnit: string; durationMins: number };
  /** When the customer wants the service; absent = as soon as possible. */
  scheduledAt?: Date;
  address: {
    name: string;
    phone: string;
    line1: string;
    line2?: string;
    landmark?: string;
    city: string;
    state: string;
    pincode: string;
    location?: { lat: number; lng: number };
  };
  distanceKm?: number;
  price: number;
  paymentMethod: BookingPaymentMethod;
  paymentStatus: BookingPaymentStatus;
  paymentRef?: string;
  status: BookingStatus;
  statusHistory: { status: BookingStatus; at: Date; by?: string; note?: string }[];
  note?: string;
  /** Proven on completion, so a job can't be closed without the customer. */
  completionOtp: string;
  /** The ring session currently finding a provider for this booking. */
  dispatch?: Types.ObjectId;
  cancelledBy?: 'customer' | 'provider' | 'admin';
  cancelReason?: string;
  acceptedAt?: Date;
  completedAt?: Date;
  /** What the provider earned (set on completion). */
  providerEarning?: number;
  rating?: number;
  reviewComment?: string;
  createdAt: Date;
  updatedAt: Date;
}

const serviceBookingSchema = new Schema<IServiceBooking>(
  {
    bookingNumber: { type: String, required: true, unique: true },
    customer: { type: Schema.Types.ObjectId, ref: 'User', required: true, index: true },
    service: { type: Schema.Types.ObjectId, ref: 'Service', required: true, index: true },
    category: { type: Schema.Types.ObjectId, ref: 'ServiceCategory', required: true, index: true },
    provider: { type: Schema.Types.ObjectId, ref: 'User', required: true, index: true },
    snapshot: {
      title: { type: String, required: true },
      image: String,
      price: { type: Number, required: true },
      priceUnit: { type: String, required: true },
      durationMins: { type: Number, required: true },
    },
    scheduledAt: Date,
    address: {
      name: { type: String, required: true },
      phone: { type: String, required: true },
      line1: { type: String, required: true },
      line2: String,
      landmark: String,
      city: { type: String, required: true },
      state: { type: String, required: true },
      pincode: { type: String, required: true },
      location: { lat: Number, lng: Number },
    },
    distanceKm: Number,
    price: { type: Number, required: true },
    paymentMethod: { type: String, enum: BOOKING_PAYMENT_METHODS, required: true },
    paymentStatus: { type: String, enum: BOOKING_PAYMENT_STATUSES, default: 'pending' },
    paymentRef: String,
    status: { type: String, enum: BOOKING_STATUSES, default: 'requested', index: true },
    statusHistory: {
      type: [
        {
          status: { type: String, enum: BOOKING_STATUSES, required: true },
          at: { type: Date, default: Date.now },
          by: String,
          note: String,
          _id: false,
        },
      ],
      default: [],
    },
    note: { type: String, trim: true, maxlength: 500 },
    completionOtp: { type: String, required: true },
    dispatch: { type: Schema.Types.ObjectId, ref: 'Dispatch' },
    cancelledBy: { type: String, enum: ['customer', 'provider', 'admin'] },
    cancelReason: String,
    acceptedAt: Date,
    completedAt: Date,
    providerEarning: { type: Number, default: 0, min: 0 },
    rating: { type: Number, min: 1, max: 5 },
    reviewComment: { type: String, trim: true, maxlength: 1000 },
  },
  { timestamps: true },
);

serviceBookingSchema.index({ customer: 1, createdAt: -1 });
serviceBookingSchema.index({ provider: 1, createdAt: -1 });
serviceBookingSchema.index({ status: 1, createdAt: -1 });

export const ServiceBooking = model<IServiceBooking>('ServiceBooking', serviceBookingSchema);
