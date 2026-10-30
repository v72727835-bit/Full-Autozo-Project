import { Schema, Types, model } from 'mongoose';
import { SubscriptionAudience } from './SubscriptionPlan';

/**
 * One purchase (or admin grant) of plan days. A Razorpay purchase starts as `created` and adds its
 * days only once the server has verified the payment; an admin grant is `paid` straight away.
 */
export interface ISubscriptionPayment {
  user: Types.ObjectId;
  audience: SubscriptionAudience;
  source: 'razorpay' | 'admin';
  plan?: Types.ObjectId;
  /** The plan as it was bought, so later price edits do not rewrite history. */
  planName: string;
  days: number;
  amount: number;
  status: 'created' | 'paid' | 'failed';
  razorpayOrderId?: string;
  paymentId?: string;
  /** The plan period this purchase covers, filled in when it is paid. */
  startsAt?: Date;
  endsAt?: Date;
  note?: string;
  createdAt: Date;
  updatedAt: Date;
}

const schema = new Schema<ISubscriptionPayment>(
  {
    user: { type: Schema.Types.ObjectId, ref: 'User', required: true, index: true },
    audience: { type: String, enum: ['rider', 'seller', 'provider'], required: true, index: true },
    source: { type: String, enum: ['razorpay', 'admin'], required: true },
    plan: { type: Schema.Types.ObjectId, ref: 'SubscriptionPlan' },
    planName: { type: String, required: true },
    days: { type: Number, required: true },
    amount: { type: Number, required: true, default: 0 },
    status: { type: String, enum: ['created', 'paid', 'failed'], default: 'created', index: true },
    razorpayOrderId: { type: String, unique: true, sparse: true },
    paymentId: String,
    startsAt: Date,
    endsAt: Date,
    note: { type: String, trim: true, maxlength: 200 },
  },
  { timestamps: true },
);

export const SubscriptionPayment = model<ISubscriptionPayment>('SubscriptionPayment', schema);
