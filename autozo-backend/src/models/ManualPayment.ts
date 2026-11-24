import { Schema, Types, model } from 'mongoose';

/**
 * Money a rider, service provider or warehouse paid the office outside the app (UPI / QR / bank transfer)
 * and reported with its transaction id. It stays `pending` until an admin confirms the money arrived
 * (then it is applied: cash cleared, commission cleared, or plan days added) or rejects it.
 */
export type ManualPurpose = 'rider_cash' | 'provider_dues' | 'subscription';
export type ManualMethod = 'upi' | 'bank' | 'qr';

export interface IManualPayment {
  user: Types.ObjectId;
  role: 'rider' | 'provider' | 'seller';
  purpose: ManualPurpose;
  /** Rupees. For a plan it is always the plan's price. */
  amount: number;
  method: ManualMethod;
  /** The UPI / bank transaction id (UTR) the office can look for in the account. */
  reference: string;
  /** Optional payment screenshot. */
  proof?: string;
  note?: string;
  plan?: Types.ObjectId;
  planName?: string;
  days?: number;
  status: 'pending' | 'confirmed' | 'rejected';
  handledBy?: Types.ObjectId;
  handledAt?: Date;
  adminNote?: string;
  createdAt: Date;
  updatedAt: Date;
}

const schema = new Schema<IManualPayment>(
  {
    user: { type: Schema.Types.ObjectId, ref: 'User', required: true, index: true },
    role: { type: String, enum: ['rider', 'provider', 'seller'], required: true },
    purpose: { type: String, enum: ['rider_cash', 'provider_dues', 'subscription'], required: true },
    amount: { type: Number, required: true, min: 1 },
    method: { type: String, enum: ['upi', 'bank', 'qr'], required: true },
    reference: { type: String, required: true, trim: true, maxlength: 60 },
    proof: { type: String, trim: true, maxlength: 500 },
    note: { type: String, trim: true, maxlength: 200 },
    plan: { type: Schema.Types.ObjectId, ref: 'SubscriptionPlan' },
    planName: String,
    days: Number,
    status: { type: String, enum: ['pending', 'confirmed', 'rejected'], default: 'pending', index: true },
    handledBy: { type: Schema.Types.ObjectId, ref: 'User' },
    handledAt: Date,
    adminNote: { type: String, trim: true, maxlength: 200 },
  },
  { timestamps: true },
);
schema.index({ user: 1, createdAt: -1 });

export const ManualPayment = model<IManualPayment>('ManualPayment', schema);
