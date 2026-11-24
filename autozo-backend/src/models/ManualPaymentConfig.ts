import { Schema, model } from 'mongoose';

/** Where partners send manual payments: the QR picture, UPI id and bank account the super admin types in. Nothing secret. */
export interface IManualPaymentConfig {
  key: 'global';
  enabled: boolean;
  payeeName?: string;
  upiId?: string;
  qrImage?: string;
  bankHolder?: string;
  bankName?: string;
  bankNumber?: string;
  bankIfsc?: string;
  note?: string;
}

const schema = new Schema<IManualPaymentConfig>(
  {
    key: { type: String, default: 'global', unique: true },
    enabled: { type: Boolean, default: false },
    payeeName: { type: String, trim: true, maxlength: 80 },
    upiId: { type: String, trim: true, maxlength: 80 },
    qrImage: { type: String, trim: true, maxlength: 500 },
    bankHolder: { type: String, trim: true, maxlength: 80 },
    bankName: { type: String, trim: true, maxlength: 80 },
    bankNumber: { type: String, trim: true, maxlength: 30 },
    bankIfsc: { type: String, trim: true, maxlength: 20 },
    note: { type: String, trim: true, maxlength: 300 },
  },
  { timestamps: true },
);

export const ManualPaymentConfig = model<IManualPaymentConfig>('ManualPaymentConfig', schema);
