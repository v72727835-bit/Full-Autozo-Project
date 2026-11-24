import { Types } from 'mongoose';
import { ManualPayment, ManualPurpose } from '../models/ManualPayment';

/** Manual (UPI / QR / bank) payments a person has sent that the office has not confirmed yet, in rupees. */
export async function pendingManualTotal(userId: Types.ObjectId | string, purpose: ManualPurpose): Promise<number> {
  const rows = await ManualPayment.aggregate<{ total: number }>([
    { $match: { user: new Types.ObjectId(String(userId)), purpose, status: 'pending' } },
    { $group: { _id: null, total: { $sum: '$amount' } } },
  ]);
  return rows[0]?.total ?? 0;
}
