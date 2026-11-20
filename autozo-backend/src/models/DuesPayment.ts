import { Schema, Types, model } from 'mongoose';

/**
 * Cash a rider or service provider owes the office, paid online through Razorpay. One record per
 * started payment; `status` flips created -> paid exactly once, and `creditedAt` is set once the money
 * has been applied to the rider's cash / the provider's commission (so a crash in between is retried).
 */
export type DuesKind = 'rider_cash' | 'provider_dues';

export interface IDuesPayment {
  user: Types.ObjectId;
  kind: DuesKind;
  /** Rupees. */
  amount: number;
  razorpayOrderId: string;
  paymentId?: string;
  status: 'created' | 'paid';
  /** Taken while the money is being applied, so two callers never both credit it. */
  creditingAt?: Date;
  creditedAt?: Date;
  createdAt: Date;
}

const schema = new Schema<IDuesPayment>(
  {
    user: { type: Schema.Types.ObjectId, ref: 'User', required: true, index: true },
    kind: { type: String, enum: ['rider_cash', 'provider_dues'], required: true },
    amount: { type: Number, required: true, min: 1 },
    razorpayOrderId: { type: String, required: true, unique: true },
    paymentId: String,
    status: { type: String, enum: ['created', 'paid'], default: 'created' },
    creditingAt: Date,
    creditedAt: Date,
  },
  { timestamps: { createdAt: true, updatedAt: false } },
);

export const DuesPayment = model<IDuesPayment>('DuesPayment', schema);
