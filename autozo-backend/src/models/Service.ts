import { Schema, Types, model } from 'mongoose';
import { uniqueSlug } from '../utils/helpers';

/** How a service is priced. `fixed` = one price, `hourly` = per hour, `visit` = per visit/call-out. */
export const PRICE_UNITS = ['fixed', 'hourly', 'visit'] as const;
export type PriceUnit = (typeof PRICE_UNITS)[number];

export const WEEKDAYS = ['sun', 'mon', 'tue', 'wed', 'thu', 'fri', 'sat'] as const;
export type Weekday = (typeof WEEKDAYS)[number];

/** A single opening window on a weekday, e.g. mon 09:00–18:00. */
export interface IAvailabilitySlot {
  day: Weekday;
  open: string; // "HH:MM" 24h
  close: string; // "HH:MM" 24h
}

/**
 * One service a provider offers. Providers create, price, time and manage these
 * from their panel; customers browse and book them. A listing only goes public
 * when the provider is approved (`providerStatus: 'approved'`) and `isActive`.
 */
export interface IService {
  provider: Types.ObjectId;
  category: Types.ObjectId;
  title: string;
  slug: string;
  description?: string;
  images: string[];
  price: number;
  mrp?: number;
  priceUnit: PriceUnit;
  /** How long one booking takes, in minutes (for scheduling). */
  durationMins: number;
  /** Weekly opening hours; empty = available any time the provider is online. */
  availability: IAvailabilitySlot[];
  /** How far the provider will travel for an at-home service, in km. */
  serviceRadiusKm: number;
  /** Where the provider is based: [lng, lat]. Copied from the provider's base. */
  location: { type: 'Point'; coordinates: [number, number] };
  city?: string;
  tags: string[];
  isActive: boolean;
  rating: number;
  ratingCount: number;
  bookingCount: number;
}

const availabilitySchema = new Schema<IAvailabilitySlot>(
  {
    day: { type: String, enum: WEEKDAYS, required: true },
    open: { type: String, required: true },
    close: { type: String, required: true },
  },
  { _id: false },
);

const serviceSchema = new Schema<IService>(
  {
    provider: { type: Schema.Types.ObjectId, ref: 'User', required: true, index: true },
    category: { type: Schema.Types.ObjectId, ref: 'ServiceCategory', required: true, index: true },
    title: { type: String, required: true, trim: true, maxlength: 120 },
    slug: { type: String, unique: true, lowercase: true, trim: true },
    description: { type: String, trim: true, maxlength: 4000 },
    images: { type: [String], default: [] },
    price: { type: Number, required: true, min: 0 },
    mrp: { type: Number, min: 0 },
    priceUnit: { type: String, enum: PRICE_UNITS, default: 'fixed' },
    durationMins: { type: Number, default: 60, min: 5, max: 24 * 60 },
    availability: { type: [availabilitySchema], default: [] },
    serviceRadiusKm: { type: Number, default: 10, min: 1, max: 100 },
    location: {
      type: { type: String, enum: ['Point'], default: 'Point' },
      coordinates: { type: [Number], default: [0, 0] }, // [lng, lat]
    },
    city: { type: String, trim: true },
    tags: { type: [String], default: [] },
    isActive: { type: Boolean, default: true, index: true },
    rating: { type: Number, default: 0, min: 0, max: 5 },
    ratingCount: { type: Number, default: 0 },
    bookingCount: { type: Number, default: 0 },
  },
  { timestamps: true },
);

serviceSchema.index({ location: '2dsphere' });
serviceSchema.index({ category: 1, isActive: 1 });
serviceSchema.index({ provider: 1, createdAt: -1 });
serviceSchema.index({ title: 'text', description: 'text', tags: 'text' });

serviceSchema.pre('validate', function (next) {
  if (!this.slug) this.slug = uniqueSlug(this.title);
  next();
});

export const Service = model<IService>('Service', serviceSchema);
