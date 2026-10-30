import { Schema, Types, model } from 'mongoose';

/**
 * One line in a service provider's wallet.
 *
 * - `earning`: an online-paid booking was completed. The platform holds the
 *   customer's money, so the provider's share (price minus commission) is
 *   credited here and can be withdrawn.
 * - `commission`: a cash (COD) booking was completed by a provider with no
 *   running plan. The provider kept the whole cash, so the commission is a due
 *   they owe the platform. While dues are over the limit they get no new bookings.
 * - `commission_paid`: the provider pays dues — from the wallet (settled at
 *   once), or in cash / UPI to the office (held `pending` until the super admin
 *   confirms the money arrived). The super admin can also record a collection.
 * - `withdrawal`: a payout of the wallet balance, `pending` until paid or rejected.
 * - `adjustment`: a manual credit from the super admin.
 */
export type ProviderTxnKind = 'earning' | 'commission' | 'commission_paid' | 'withdrawal' | 'adjustment';
export type ProviderTxnStatus = 'completed' | 'pending' | 'paid' | 'rejected' | 'confirmed';
export type ProviderTxnMethod = 'upi' | 'bank' | 'cash' | 'wallet';

export interface IProviderTxn {
  provider: Types.ObjectId;
  kind: ProviderTxnKind;
  /** Always positive; `kind` says which way the money moves. */
  amount: number;
  status: ProviderTxnStatus;
  booking?: Types.ObjectId;
  bookingNumber?: string;
  /** For booking lines: what the customer paid, how, and the commission taken. */
  gross?: number;
  commission?: number;
  commissionPct?: number;
  paymentMethod?: 'cod' | 'online';
  /** Withdrawal: upi / bank. Dues payment: wallet / cash / upi. */
  method?: ProviderTxnMethod;
  destination?: string;
  reference?: string;
  payoutId?: string;
  payoutStatus?: string;
  note?: string;
  createdAt: Date;
  updatedAt: Date;
}

const schema = new Schema<IProviderTxn>(
  {
    provider: { type: Schema.Types.ObjectId, ref: 'User', required: true, index: true },
    kind: { type: String, enum: ['earning', 'commission', 'commission_paid', 'withdrawal', 'adjustment'], required: true },
    amount: { type: Number, required: true, min: 0 },
    status: { type: String, enum: ['completed', 'pending', 'paid', 'rejected', 'confirmed'], default: 'completed' },
    booking: { type: Schema.Types.ObjectId, ref: 'ServiceBooking' },
    bookingNumber: { type: String, trim: true },
    gross: { type: Number, min: 0 },
    commission: { type: Number, min: 0 },
    commissionPct: { type: Number, min: 0 },
    paymentMethod: { type: String, enum: ['cod', 'online'] },
    method: { type: String, enum: ['upi', 'bank', 'cash', 'wallet'] },
    destination: { type: String, trim: true },
    reference: { type: String, trim: true },
    payoutId: { type: String, trim: true, index: true },
    payoutStatus: { type: String, trim: true },
    note: { type: String, trim: true },
  },
  { timestamps: true },
);

schema.index({ provider: 1, createdAt: -1 });
schema.index({ kind: 1, status: 1 });
// A booking is settled once: one earning or one commission line per booking.
schema.index({ booking: 1, kind: 1 }, { unique: true, partialFilterExpression: { booking: { $exists: true } } });

export const ProviderTxn = model<IProviderTxn>('ProviderTxn', schema);
