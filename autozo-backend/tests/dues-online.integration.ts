import './env';
import assert from 'node:assert/strict';
import crypto from 'node:crypto';
import { test, mock } from 'node:test';
import mongoose, { Types } from 'mongoose';
import { MongoMemoryServer } from 'mongodb-memory-server-core';
import app from '../src/app';
import { User } from '../src/models/User';
import { Order } from '../src/models/Order';
import { Settings } from '../src/models/Settings';
import { Integrations } from '../src/models/Integrations';
import { WalletTxn } from '../src/models/WalletTxn';
import { ProviderTxn } from '../src/models/ProviderTxn';
import { SubscriptionPayment } from '../src/models/SubscriptionPayment';
import { SubscriptionPlan } from '../src/models/SubscriptionPlan';
import { invalidateIntegrations } from '../src/services/integrations.service';
import { clearSettingsCache } from '../src/services/settings.service';
import { refreshProviderDue } from '../src/services/providerPay.service';
import { seal } from '../src/utils/secretBox';
import { signAccessToken } from '../src/utils/jwt';

/*
 * Riders and providers pay the cash they owe the office online (Razorpay), and a plan can be paid
 * the same way. Each payment is credited exactly once - by the app's confirmation or, if the app
 * never got to confirm, by a later sync that asks Razorpay - and only for what was really paid.
 */
const SECRET = 'fixture-secret';
const sign = (orderId: string, paymentId: string) => crypto.createHmac('sha256', SECRET).update(`${orderId}|${paymentId}`).digest('hex');

test('riders and providers pay what they owe online, once, and a missed confirmation is recovered', { timeout: 900000 }, async () => {
  const db = await MongoMemoryServer.create({ binary: { version: '8.2.6' }, instance: { launchTimeout: 60000 } });
  await mongoose.connect(db.getUri());
  const server = app.listen(0, '127.0.0.1');
  await new Promise<void>((resolve) => server.once('listening', resolve));
  const base = `http://127.0.0.1:${(server.address() as { port: number }).port}/api/v1`;
  const originalFetch = globalThis.fetch;
  try {
    const rider = await User.create({ name: 'Rider', phone: '9876543201', password: 'test-password', role: 'rider' });
    const provider = await User.create({ name: 'Provider', phone: '9876543202', password: 'test-password', role: 'provider', providerStatus: 'approved' });
    const seller = await User.create({ name: 'Warehouse', phone: '9876543203', password: 'test-password', role: 'seller' });
    await Settings.create({ key: 'global' });
    await Integrations.create({ key: 'global', razorpay: { keyId: 'rzp_test_fixture', keySecretEnc: seal(SECRET), enabled: true } });
    invalidateIntegrations();
    clearSettingsCache();

    // Razorpay is faked: no real gateway request or payment happens in this test.
    let seq = 0;
    const razorpayOrders: Record<string, number> = {};
    const captured: Record<string, string> = {}; // orderId -> paymentId the "customer" actually paid
    mock.method(globalThis, 'fetch', async (url: any, options: any) => {
      const u = String(url);
      if (!u.startsWith('https://api.razorpay.com/')) return originalFetch(url, options);
      if (options?.method === 'POST' && u.endsWith('/orders')) {
        const body = JSON.parse(options.body);
        const id = `order_${++seq}`;
        razorpayOrders[id] = body.amount;
        return new Response(JSON.stringify({ id, amount: body.amount, currency: 'INR' }), { status: 200 });
      }
      const m = /\/orders\/(order_\d+)\/payments$/.exec(u);
      if (m) {
        const paid = captured[m[1]];
        return new Response(JSON.stringify({ items: paid ? [{ id: paid, status: 'captured', amount: razorpayOrders[m[1]] }] : [{ id: 'pay_failed', status: 'failed', amount: razorpayOrders[m[1]] }] }), { status: 200 });
      }
      throw new Error(`unexpected Razorpay call ${u}`);
    });

    const call = async (who: { _id: unknown; role: string }, method: string, path: string, body?: unknown) => {
      const response = await originalFetch(base + path, { method, headers: { Authorization: `Bearer ${signAccessToken(String(who._id), who.role)}`, 'Content-Type': 'application/json' }, body: body ? JSON.stringify(body) : undefined });
      return { status: response.status, body: (await response.json()) as any };
    };
    const delivered = async (total: number, minutesAgo: number) => {
      const at = new Date(Date.now() - minutesAgo * 60_000);
      await Order.collection.insertOne({ orderNumber: `AZ-${total}-${minutesAgo}`, user: new Types.ObjectId(), shop: new Types.ObjectId(), rider: rider._id, status: 'delivered', paymentMethod: 'cod', items: [], subtotal: total, deliveryFee: 0, discount: 0, total, codSettled: false, statusHistory: [], createdAt: at, updatedAt: at, deliveredAt: at });
    };
    const riderOwes = async () => (await call(rider, 'GET', '/rider/wallet')).body.data.codPending as number;
    const confirm = (who: { _id: unknown; role: string }, orderId: string, paymentId: string, signature = sign(orderId, paymentId)) =>
      call(who, 'POST', '/dues/confirm', { razorpay_order_id: orderId, razorpay_payment_id: paymentId, razorpay_signature: signature });

    /* ---------------- rider: COD cash ---------------- */
    await delivered(100, 40);
    await delivered(250, 30);
    assert.equal(await riderOwes(), 350);

    const started = await call(rider, 'POST', '/dues/pay', {});
    assert.equal(started.status, 201, JSON.stringify(started.body));
    assert.equal(started.body.data.amount, 35000, 'the whole amount owed, in paise');
    assert.equal(started.body.data.keyId, 'rzp_test_fixture');
    const orderA = started.body.data.razorpayOrderId as string;

    assert.equal((await confirm(rider, orderA, 'pay_A', 'x'.repeat(64))).status, 400, 'a bad signature is refused');
    assert.equal(await riderOwes(), 350, 'nothing is credited for a refused payment');

    // The app and a retry confirm at the same instant: the cash is credited once.
    const both = await Promise.all([confirm(rider, orderA, 'pay_A'), confirm(rider, orderA, 'pay_A')]);
    assert.deepEqual(both.map((r) => r.status), [200, 200], JSON.stringify(both.map((r) => r.body)));
    assert.equal(await riderOwes(), 0, 'the office has the cash, so the rider owes nothing');
    const logged = await WalletTxn.find({ rider: rider._id, kind: 'cash_submit', reference: 'pay_A' }).lean();
    assert.equal(logged.length, 1, 'one passbook entry');
    assert.equal(logged[0].status, 'confirmed');
    assert.equal((await call(rider, 'POST', '/dues/pay', {})).status, 400, 'nothing owed, nothing to pay');

    // A partial payment clears the oldest deliveries first and an over-large amount is capped to what is owed.
    await delivered(300, 20);
    await delivered(200, 10);
    assert.equal(await riderOwes(), 500);
    const partial = await call(rider, 'POST', '/dues/pay', { amount: 300 });
    assert.equal(partial.body.data.amount, 30000);
    assert.equal((await confirm(rider, partial.body.data.razorpayOrderId, 'pay_B')).status, 200);
    assert.equal(await riderOwes(), 200);
    const capped = await call(rider, 'POST', '/dues/pay', { amount: 99999 });
    assert.equal(capped.body.data.amount, 20000, 'capped to what is owed');

    // The rider paid in the UPI app but the confirmation never reached us: a sync asks Razorpay and credits once.
    captured[capped.body.data.razorpayOrderId] = 'pay_C';
    const synced = await call(rider, 'POST', '/dues/sync');
    assert.equal(synced.status, 200, JSON.stringify(synced.body));
    assert.equal(await riderOwes(), 0);
    await call(rider, 'POST', '/dues/sync');
    assert.equal(await WalletTxn.countDocuments({ rider: rider._id, kind: 'cash_submit', reference: 'pay_C' }), 1, 'a second sync does not credit again');

    // An abandoned payment (Razorpay shows no captured payment) credits nothing.
    await delivered(150, 5);
    const abandoned = await call(rider, 'POST', '/dues/pay', {});
    await call(rider, 'POST', '/dues/sync');
    assert.equal(await riderOwes(), 150);
    assert.ok(abandoned.body.data.razorpayOrderId);

    /* ---------------- provider: commission due ---------------- */
    await ProviderTxn.create({ provider: provider._id, kind: 'commission', amount: 400, status: 'completed', note: 'seed' });
    await refreshProviderDue(provider._id);
    const pp = await call(provider, 'POST', '/dues/pay', {});
    assert.equal(pp.status, 201, JSON.stringify(pp.body));
    assert.equal(pp.body.data.amount, 40000);
    assert.equal((await confirm(provider, pp.body.data.razorpayOrderId, 'pay_P')).status, 200);
    const wallet = (await call(provider, 'GET', '/provider/wallet')).body.data;
    assert.equal(wallet.due, 0, 'the commission is cleared');
    const paid = await ProviderTxn.find({ provider: provider._id, kind: 'commission_paid' }).lean();
    assert.equal(paid.length, 1);
    assert.equal(paid[0].status, 'confirmed');
    assert.equal(paid[0].method, 'online');

    /* ---------------- who may use it ---------------- */
    assert.equal((await call(seller, 'POST', '/dues/pay', {})).status, 403, 'a warehouse has no cash dues');
    assert.equal((await call(rider, 'POST', '/dues/confirm', {})).status, 400);

    /* ---------------- plan payment recovered by sync ---------------- */
    const plan = await SubscriptionPlan.create({ audience: 'rider', name: 'Monthly', price: 299, days: 30, active: true });
    const startedPlan = await call(rider, 'POST', '/subscription/pay', { planId: String(plan._id) });
    assert.equal(startedPlan.status, 201, JSON.stringify(startedPlan.body));
    const planOrder = startedPlan.body.data.razorpayOrderId as string;
    captured[planOrder] = 'pay_plan';
    assert.equal((await call(rider, 'POST', '/subscription/sync')).status, 200);
    const afterSync = await User.findById(rider._id).select('subscriptionUntil').lean();
    assert.ok(afterSync?.subscriptionUntil && afterSync.subscriptionUntil.getTime() > Date.now() + 29 * 86_400_000, 'the plan days were added');
    const until = afterSync!.subscriptionUntil!.getTime();
    await call(rider, 'POST', '/subscription/sync');
    assert.equal((await User.findById(rider._id).select('subscriptionUntil').lean())?.subscriptionUntil?.getTime(), until, 'a second sync adds no more days');
    assert.equal(await SubscriptionPayment.countDocuments({ user: rider._id, status: 'paid' }), 1);
  } finally {
    mock.restoreAll();
    server.close();
    await mongoose.disconnect();
    await db.stop();
  }
});
