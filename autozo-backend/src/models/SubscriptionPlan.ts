import { Schema, model } from 'mongoose';

export type SubscriptionAudience = 'rider' | 'seller' | 'provider';

/** A paid plan the super admin offers to riders or to warehouses (sellers). Price is in rupees. */
export interface ISubscriptionPlan {
  audience: SubscriptionAudience;
  name: string;
  price: number;
  days: number;
  description?: string;
  /** Hidden plans are not offered any more; people who bought one keep their days. */
  active: boolean;
  sort: number;
  createdAt: Date;
  updatedAt: Date;
}

const schema = new Schema<ISubscriptionPlan>(
  {
    audience: { type: String, enum: ['rider', 'seller', 'provider'], required: true, index: true },
    name: { type: String, required: true, trim: true, maxlength: 60 },
    price: { type: Number, required: true, min: 1 },
    days: { type: Number, required: true, min: 1 },
    description: { type: String, trim: true, maxlength: 200 },
    active: { type: Boolean, default: true },
    sort: { type: Number, default: 0 },
  },
  { timestamps: true },
);

export const SubscriptionPlan = model<ISubscriptionPlan>('SubscriptionPlan', schema);
