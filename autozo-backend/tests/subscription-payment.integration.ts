import './env';
import assert from 'node:assert/strict';
import crypto from 'node:crypto';
import { test, mock } from 'node:test';
import mongoose from 'mongoose';
import { MongoMemoryServer } from 'mongodb-memory-server-core';
import app from '../src/app';
import { User } from '../src/models/User';
import { Settings } from '../src/models/Settings';
import { Integrations } from '../src/models/Integrations';
import { SubscriptionPayment } from '../src/models/SubscriptionPayment';
import { invalidateIntegrations } from '../src/services/integrations.service';
import { clearSettingsCache } from '../src/services/settings.service';
import { seal } from '../src/utils/secretBox';
import { signAccessToken } from '../src/utils/jwt';

const DAY = 24 * 60 * 60 * 1000;

test('admin sets a plan, a warehouse pays through Razorpay and gets its days exactly once', { timeout: 900000 }, async () => {
  const db = await MongoMemoryServer.create({ binary: { version: '8.2.6' }, instance: { launchTimeout: 60000 } });
  await mongoose.connect(db.getUri());
  const server = app.listen(0, '127.0.0.1');
  await new Promise<void>((resolve) => server.once('listening', resolve));
  const base = `http://127.0.0.1:${(server.address() as { port: number }).port}/api/v1`;
  const originalFetch = globalThis.fetch;
  try {
    const admin = await User.create({ name: 'Admin', phone: '9876543200', password: 'test-password', role: 'admin' });
    const seller = await User.create({ name: 'Warehouse', phone: '9876543201', password: 'test-password', role: 'seller' });
    await Settings.create({ key: 'global' });
    await Integrations.create({ key: 'global', razorpay: { keyId: 'rzp_test_fixture', keySecretEnc: seal('fixture-secret'), enabled: true } });
    invalidateIntegrations();
    clearSettingsCache();
    mock.method(globalThis, 'fetch', async (url: any, options: any) => {
      if (!String(url).startsWith('https://api.razorpay.com/')) return originalFetch(url, options);
      // No external gateway requests or real payments occur in this test.
      const body = JSON.parse(options.body);
      assert.equal(body.amount, 49900);
      return new Response(JSON.stringify({ id: 'order_sub_fixture', amount: body.amount, currency: 'INR' }), { status: 200 });
    });
    const call = async (method: string, path: string, who: { _id: unknown; role: string }, body?: unknown) => {
      const response = await originalFetch(base + path, { method, headers: { Authorization: `Bearer ${signAccessToken(String(who._id), who.role)}`, 'Content-Type': 'application/json' }, body: body ? JSON.stringify(body) : undefined });
      return { status: response.status, body: await response.json() as any };
    };

    // Switched off: the warehouse works without a plan.
    assert.equal((await call('GET', '/seller/orders', seller)).status, 200);

    const plan = await call('POST', '/admin/subscriptions/plans', admin, { audience: 'seller', name: 'Monthly', price: 499, days: 30 });
    assert.equal(plan.status, 201, JSON.stringify(plan.body));
    assert.equal((await call('PUT', '/admin/subscriptions/switches', admin, { seller: true })).body.data.seller, true);

    const blocked = await call('GET', '/seller/orders', seller);
    assert.equal(blocked.status, 402);
    assert.equal(blocked.body.details.code, 'subscription_required');
    assert.equal((await call('POST', '/seller/products', seller, {})).status, 402);

    const mine = await call('GET', '/subscription', seller);
    assert.equal(mine.body.data.required, true);
    assert.equal(mine.body.data.active, false);
    assert.equal(mine.body.data.plans.length, 1);
    // A rider never sees warehouse plans.
    const rider = await User.create({ name: 'Rider', phone: '9876543202', password: 'test-password', role: 'rider' });
    assert.equal((await call('GET', '/subscription', rider)).body.data.plans.length, 0);
    assert.equal((await call('POST', '/subscription/pay', rider, { planId: plan.body.data._id })).status, 404);

    const started = await call('POST', '/subscription/pay', seller, { planId: plan.body.data._id });
    assert.equal(started.status, 201, JSON.stringify(started.body));
    assert.equal(started.body.data.keyId, 'rzp_test_fixture');

    const bad = await call('POST', '/subscription/confirm', seller, { razorpay_order_id: 'order_sub_fixture', razorpay_payment_id: 'pay_fixture', razorpay_signature: 'x'.repeat(64) });
    assert.equal(bad.status, 400);
    assert.equal((await call('GET', '/seller/orders', seller)).status, 402);

    const signature = crypto.createHmac('sha256', 'fixture-secret').update('order_sub_fixture|pay_fixture').digest('hex');
    const paid = { razorpay_order_id: 'order_sub_fixture', razorpay_payment_id: 'pay_fixture', razorpay_signature: signature };
    const confirmed = await call('POST', '/subscription/confirm', seller, paid);
    assert.equal(confirmed.status, 200, JSON.stringify(confirmed.body));
    assert.equal(confirmed.body.data.active, true);
    const until = (await User.findById(seller._id).lean())!.subscriptionUntil!.getTime();
    assert.ok(Math.abs(until - (Date.now() + 30 * DAY)) < 60_000);

    // Sending the confirmation again never adds the days twice.
    assert.equal((await call('POST', '/subscription/confirm', seller, paid)).status, 200);
    assert.equal((await User.findById(seller._id).lean())!.subscriptionUntil!.getTime(), until);
    assert.equal(await SubscriptionPayment.countDocuments({ status: 'paid' }), 1);

    assert.equal((await call('GET', '/seller/orders', seller)).status, 200);

    // Free days from the admin extend from the current end, not from today.
    assert.equal((await call('POST', `/admin/subscriptions/members/${seller._id}/grant`, admin, { days: 7 })).status, 200);
    assert.equal((await User.findById(seller._id).lean())!.subscriptionUntil!.getTime(), until + 7 * DAY);

    const list = await call('GET', '/admin/subscriptions/members?audience=seller&status=active', admin);
    assert.equal(list.body.data.length, 1);
    assert.equal(list.body.data[0].planActive, true);

    assert.equal((await call('POST', `/admin/subscriptions/members/${seller._id}/end`, admin)).status, 200);
    assert.equal((await call('GET', '/seller/orders', seller)).status, 402);

    // Switching plans off frees everyone again.
    await call('PUT', '/admin/subscriptions/switches', admin, { seller: false });
    assert.equal((await call('GET', '/seller/orders', seller)).status, 200);
  } finally {
    mock.restoreAll();
    await new Promise<void>((resolve) => server.close(() => resolve()));
    await mongoose.disconnect();
    await db.stop();
  }
});
