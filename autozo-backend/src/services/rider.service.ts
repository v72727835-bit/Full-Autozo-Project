import { Types } from 'mongoose';
import { AdminAlert } from '../models/AdminAlert';
import { Order } from '../models/Order';
import { User } from '../models/User';
import { WalletTxn } from '../models/WalletTxn';
import { loadSettings } from './settings.service';

/** A rider counts as online if the app talked to us within this window. */
export const ONLINE_WINDOW_MS = 2 * 60_000;

/** COD cash each rider has collected and not yet handed in, plus lifetime totals. */
export async function codSummary(riderIds?: Types.ObjectId[]) {
  const match: Record<string, unknown> = { status: 'delivered', paymentMethod: 'cod', rider: { $exists: true } };
  if (riderIds) match.rider = { $in: riderIds };
  const rows = await Order.aggregate<{ _id: Types.ObjectId; pending: number; total: number; deliveries: number }>([
    { $match: match },
    {
      $group: {
        _id: '$rider',
        total: { $sum: '$total' },
        pending: { $sum: { $cond: [{ $eq: ['$codSettled', true] }, 0, '$total'] } },
        deliveries: { $sum: 1 },
      },
    },
  ]);
  return new Map(rows.map((r) => [String(r._id), r]));
}

/**
 * What a rider can pay online: the whole amount owed, or - for a smaller amount - the most that
 * clears whole deliveries oldest first, so an online payment never leaves money unapplied.
 * `payable` is 0 when the amount is smaller than the oldest delivery.
 */
export async function payableCod(riderId: Types.ObjectId | string, amount?: number): Promise<{ owed: number; payable: number; oldest: number }> {
  const open = await Order.find({ rider: new Types.ObjectId(String(riderId)), status: 'delivered', paymentMethod: 'cod', codSettled: { $ne: true } })
    .sort({ deliveredAt: 1, createdAt: 1 })
    .select('total')
    .lean();
  const owed = open.reduce((sum, o) => sum + o.total, 0);
  if (amount === undefined || amount + 1 >= owed) return { owed, payable: owed, oldest: open[0]?.total ?? 0 };
  let payable = 0;
  for (const o of open) {
    if (payable + o.total > amount) break;
    payable += o.total;
  }
  return { owed, payable, oldest: open[0]?.total ?? 0 };
}

/** Cash the rider says they handed in that the office has not confirmed yet (per rider id). */
export async function awaitingCash(riderId: Types.ObjectId | string): Promise<number> {
  const rows = await WalletTxn.aggregate<{ total: number }>([
    { $match: { rider: new Types.ObjectId(String(riderId)), kind: 'cash_submit', status: 'pending' } },
    { $group: { _id: null, total: { $sum: '$amount' } } },
  ]);
  return rows[0]?.total ?? 0;
}

/**
 * The office has the rider's cash: clear what they owe. With no `amount` everything clears;
 * with an amount, whole orders clear oldest first while the cash covers them (an amount within
 * Rs 1 of everything owed counts as everything, so rounding never leaves one order behind).
 *
 * Every way the office can take cash goes through here - confirming a submission, collecting
 * from the rider directly, and (later) an online payment - so the rider's panel agrees with
 * the admin's. When nothing is owed any more, a submission still waiting is closed, and a
 * rider paused for owing too much is released once they are back under the admin's limit.
 */
export async function settleRiderCod(riderId: Types.ObjectId | string, amount?: number): Promise<{ settledOrders: number; settledAmount: number; pending: number }> {
  const id = new Types.ObjectId(String(riderId));
  const open = await Order.find({ rider: id, status: 'delivered', paymentMethod: 'cod', codSettled: { $ne: true } })
    .sort({ deliveredAt: 1, createdAt: 1 })
    .select('_id total')
    .lean();
  const owed = open.reduce((sum, o) => sum + o.total, 0);
  const everything = amount === undefined || amount + 1 >= owed;

  const chosen: Types.ObjectId[] = [];
  let settledAmount = 0;
  for (const o of open) {
    if (!everything && settledAmount + o.total > (amount ?? 0)) break;
    chosen.push(o._id as Types.ObjectId);
    settledAmount += o.total;
  }
  const result = chosen.length
    ? await Order.updateMany({ _id: { $in: chosen }, codSettled: { $ne: true } }, { $set: { codSettled: true } })
    : { modifiedCount: 0 };

  const pending = Math.max(0, owed - settledAmount);
  if (pending <= 0) {
    await WalletTxn.updateMany({ rider: id, kind: 'cash_submit', status: 'pending' }, { $set: { status: 'confirmed' } });
  }
  const { settings } = await loadSettings();
  const limit = settings.riderCodLimit ?? 2000;
  if (!limit || pending < limit) {
    await User.updateOne({ _id: id, riderPaused: true }, { $set: { riderPaused: false, riderPausedAt: null } });
  }
  return { settledOrders: result.modifiedCount, settledAmount, pending };
}

/**
 * Pauses a rider once their unsettled COD cash reaches the admin's limit, and
 * raises an alert on the admin dashboard bell. Called after each delivery.
 */
export async function autoPauseIfOverLimit(riderId: string): Promise<boolean> {
  const { settings } = await loadSettings();
  const limit = settings.riderCodLimit ?? 2000;
  if (!limit) return false;
  const pending = (await codSummary([new Types.ObjectId(riderId)])).get(riderId)?.pending ?? 0;
  if (pending < limit) return false;

  const rider = await User.findOneAndUpdate(
    { _id: riderId, riderPaused: { $ne: true } },
    { $set: { riderPaused: true, riderPausedAt: new Date() } },
    { new: true },
  )
    .select('name email phone')
    .lean();
  if (rider) {
    await AdminAlert.create({
      type: 'rider_paused',
      rider: rider._id,
      message: `${rider.name} (${rider.email ?? rider.phone}) was paused automatically: ₹${Math.round(pending)} COD not submitted.`,
    });
  }
  return true;
}
