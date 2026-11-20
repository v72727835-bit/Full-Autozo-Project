import './env';
import assert from 'node:assert/strict';
import { test } from 'node:test';
import mongoose, { Types } from 'mongoose';
import { MongoMemoryServer } from 'mongodb-memory-server-core';
import app from '../src/app';
import { User } from '../src/models/User';
import { Order } from '../src/models/Order';
import { WalletTxn } from '../src/models/WalletTxn';
import { signAccessToken } from '../src/utils/jwt';

/*
 * Cash a rider collected from customers (COD) counts as "pending" until the office
 * takes it. Once the office has taken it - by confirming the rider's cash submission
 * or by collecting from the rider directly - the rider's panel must stop showing it.
 */
test('cash the office collects no longer shows as pending to the rider', { timeout: 900000 }, async () => {
  const db = await MongoMemoryServer.create({ binary: { version: '8.2.6' }, instance: { launchTimeout: 60000 } });
  await mongoose.connect(db.getUri());
  const server = app.listen(0, '127.0.0.1');
  await new Promise<void>((resolve) => server.once('listening', resolve));
  const base = `http://127.0.0.1:${(server.address() as { port: number }).port}/api/v1`;
  try {
    const admin = await User.create({ name: 'Super Admin', phone: '9000000000', password: 'test-password', role: 'admin', isSuperAdmin: true });
    const rider = await User.create({ name: 'Rider', phone: '9000000001', password: 'test-password', role: 'rider' });
    const tokens = { admin: signAccessToken(String(admin._id), 'admin'), rider: signAccessToken(String(rider._id), 'rider') };
    const call = async (who: 'admin' | 'rider', method: string, path: string, body?: unknown) => {
      const response = await fetch(base + path, {
        method,
        headers: { Authorization: `Bearer ${tokens[who]}`, 'content-type': 'application/json' },
        body: body === undefined ? undefined : JSON.stringify(body),
      });
      return { status: response.status, body: (await response.json()) as any };
    };
    const delivered = async (total: number, minutesAgo: number) => {
      const at = new Date(Date.now() - minutesAgo * 60_000);
      await Order.collection.insertOne({
        orderNumber: `AZ-${total}-${minutesAgo}`, user: new Types.ObjectId(), shop: new Types.ObjectId(), rider: rider._id,
        status: 'delivered', paymentMethod: 'cod', items: [], subtotal: total, deliveryFee: 0, discount: 0, total,
        codSettled: false, statusHistory: [], createdAt: at, updatedAt: at, deliveredAt: at,
      });
    };
    const owed = async () => (await call('rider', 'GET', '/rider/wallet')).body.data.codPending as number;

    // Three deliveries, oldest first: Rs 100, Rs 200, Rs 300 collected in cash.
    await delivered(100, 30);
    await delivered(200, 20);
    await delivered(300, 10);
    assert.equal(await owed(), 600);

    // 1. The rider hands in Rs 300 and the office confirms: the two oldest orders (100 + 200) clear.
    const sub300 = await call('rider', 'POST', '/rider/wallet/cash-submit', { amount: 300 });
    assert.equal(sub300.status, 201, JSON.stringify(sub300.body));
    assert.equal((await call('admin', 'POST', `/admin/cash-submits/${sub300.body.data._id}/confirm`)).status, 200);
    assert.equal(await owed(), 300, 'only the cash actually handed in is cleared, oldest orders first');

    // 2. Confirming the same submission again is refused and changes nothing.
    assert.equal((await call('admin', 'POST', `/admin/cash-submits/${sub300.body.data._id}/confirm`)).status, 409);
    assert.equal(await owed(), 300);

    // 3. The rider submits again and the office REJECTS the submission: nothing is cleared.
    const subRejected = await call('rider', 'POST', '/rider/wallet/cash-submit', { amount: 300 });
    assert.equal(subRejected.status, 201);
    await WalletTxn.updateOne({ _id: subRejected.body.data._id }, { $set: { status: 'rejected' } });
    assert.equal(await owed(), 300);

    // 4. The office collects the rest straight from the rider (no submission): pending is 0,
    //    a submission still waiting is closed, and a rider paused for owing cash is released.
    const subWaiting = await call('rider', 'POST', '/rider/wallet/cash-submit', {});
    assert.equal(subWaiting.status, 201);
    await User.updateOne({ _id: rider._id }, { $set: { riderPaused: true, riderPausedAt: new Date() } });
    const collected = await call('admin', 'POST', `/admin/riders/${rider._id}/settle-cod`);
    assert.equal(collected.status, 200);
    assert.equal(collected.body.data.settledOrders, 1);
    assert.equal(await owed(), 0, 'nothing is pending once the office has the cash');
    assert.equal((await WalletTxn.findById(subWaiting.body.data._id).lean())?.status, 'confirmed', 'the waiting submission is closed');
    assert.equal((await User.findById(rider._id).lean())?.riderPaused, false, 'a rider paused for owing cash is released');

    // 5. The wallet tells the app how much is already submitted and waiting (0 now), so the
    //    screen can say "waiting for the office" instead of showing the same cash as owed.
    const wallet = (await call('rider', 'GET', '/rider/wallet')).body.data;
    assert.equal(wallet.codAwaiting, 0);
  } finally {
    server.close();
    await mongoose.disconnect();
    await db.stop();
  }
});
