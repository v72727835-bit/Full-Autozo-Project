import './env';
import assert from 'node:assert/strict';
import crypto from 'node:crypto';
import { test, mock } from 'node:test';
import mongoose from 'mongoose';
import { MongoMemoryServer } from 'mongodb-memory-server-core';
import app from '../src/app';
import { User } from '../src/models/User';
import { Service } from '../src/models/Service';
import { ServiceCategory } from '../src/models/ServiceCategory';
import { ServiceBooking } from '../src/models/ServiceBooking';
import { Settings } from '../src/models/Settings';
import { Integrations } from '../src/models/Integrations';
import { invalidateIntegrations } from '../src/services/integrations.service';
import { clearSettingsCache } from '../src/services/settings.service';
import { seal } from '../src/utils/secretBox';
import { signAccessToken } from '../src/utils/jwt';

test('provider wallet: cash commission blocks bookings until collected, online money can be withdrawn, a plan means no commission', { timeout: 900000 }, async () => {
  const db = await MongoMemoryServer.create({ binary: { version: '8.2.6' }, instance: { launchTimeout: 60000 } });
  await mongoose.connect(db.getUri());
  const server = app.listen(0, '127.0.0.1');
  await new Promise<void>((resolve) => server.once('listening', resolve));
  const base = `http://127.0.0.1:${(server.address() as { port: number }).port}/api/v1`;
  const originalFetch = globalThis.fetch;
  try {
    await Promise.all([User.syncIndexes(), Service.syncIndexes()]);
    const customer = await User.create({ name: 'Wallet Customer', phone: '9876543210', password: 'test-password', role: 'customer' });
    const provider = await User.create({ name: 'Wallet Provider', phone: '9876543211', password: 'test-password', role: 'provider', providerStatus: 'approved', providerLocation: { type: 'Point', coordinates: [83.07, 24.7] } });
    const adminUser = await User.create({ name: 'Super Admin', phone: '9876543212', password: 'test-password', role: 'admin', isSuperAdmin: true });
    const category = await ServiceCategory.create({ name: 'Cleaning' });
    const service = await Service.create({ provider: provider._id, category: category._id, title: 'Sofa cleaning', price: 500, location: { type: 'Point', coordinates: [83.07, 24.7] } });
    await Integrations.create({ key: 'global', razorpay: { keyId: 'rzp_test_fixture', keySecretEnc: seal('fixture-secret'), enabled: true } });
    invalidateIntegrations();
    // Razorpay order creation is mocked; no real payment happens.
    mock.method(globalThis, 'fetch', async (url: any, options: any) => {
      if (!String(url).startsWith('https://api.razorpay.com/')) return originalFetch(url, options);
      return new Response(JSON.stringify({ id: `order_${crypto.randomBytes(4).toString('hex')}`, amount: 50000, currency: 'INR' }), { status: 200 });
    });

    const tokens = { customer: signAccessToken(String(customer._id), 'customer'), provider: signAccessToken(String(provider._id), 'provider'), admin: signAccessToken(String(adminUser._id), 'admin') };
    const call = async (who: keyof typeof tokens, method: string, path: string, body?: unknown) => {
      const response = await originalFetch(base + path, {
        method,
        headers: { Authorization: `Bearer ${tokens[who]}`, 'Content-Type': 'application/json' },
        body: body === undefined ? undefined : JSON.stringify(body),
      });
      return { status: response.status, body: await response.json() as any };
    };
    const address = { name: 'Wallet Customer', phone: '9876543210', line1: 'House 7, Station road', city: 'Robertsganj', state: 'UP', pincode: '231216' };

    /** Book, (pay online), accept, start and finish with the customer's OTP. */
    const bookAndComplete = async (paymentMethod: 'cod' | 'online') => {
      const placed = await call('customer', 'POST', '/bookings', { serviceId: String(service._id), paymentMethod, address });
      assert.equal(placed.status, 201, JSON.stringify(placed.body));
      let bookingId = placed.body.data._id as string;
      if (paymentMethod === 'online') {
        bookingId = placed.body.data.bookingId;
        const orderId = placed.body.data.razorpayOrderId as string;
        const paymentId = `pay_${crypto.randomBytes(4).toString('hex')}`;
        const signature = crypto.createHmac('sha256', 'fixture-secret').update(`${orderId}|${paymentId}`).digest('hex');
        const confirmed = await call('customer', 'POST', '/bookings/online/confirm', { razorpay_order_id: orderId, razorpay_payment_id: paymentId, razorpay_signature: signature });
        assert.equal(confirmed.status, 201, JSON.stringify(confirmed.body));
      }
      const ring = await call('provider', 'GET', '/provider/ring');
      const item = ring.body.data.find((r: any) => r.bookingId === bookingId);
      assert.ok(item, `provider should be rung for ${bookingId}: ${JSON.stringify(ring.body)}`);
      const accepted = await call('provider', 'POST', `/provider/ring/${item.dispatchId}/accept`);
      assert.equal(accepted.status, 200, JSON.stringify(accepted.body));
      for (const status of ['on_the_way', 'in_progress']) {
        assert.equal((await call('provider', 'PATCH', `/provider/bookings/${bookingId}/status`, { status })).status, 200);
      }
      const otp = (await call('customer', 'GET', `/bookings/${bookingId}`)).body.data.completionOtp;
      const done = await call('provider', 'PATCH', `/provider/bookings/${bookingId}/status`, { status: 'completed', otp });
      assert.equal(done.status, 200, JSON.stringify(done.body));
      return bookingId;
    };
    const wallet = async () => (await call('provider', 'GET', '/provider/wallet')).body.data;

    // 1. Cash booking, no plan: 10% of ₹500 is owed and new bookings stop.
    const cashId = await bookAndComplete('cod');
    const cashBooking = await ServiceBooking.findById(cashId).lean();
    assert.equal(cashBooking?.commission, 50);
    assert.equal(cashBooking?.providerEarning, 450);
    let w = await wallet();
    assert.equal(w.due, 50);
    assert.equal(w.blocked, true);
    assert.equal(w.cashCollected, 500);
    assert.equal(w.balance, 0);
    assert.equal((await User.findById(provider._id).lean())?.providerDue, 50);

    const blockedBooking = await call('customer', 'POST', '/bookings', { serviceId: String(service._id), paymentMethod: 'cod', address });
    assert.equal(blockedBooking.status, 201);
    assert.equal((await call('provider', 'GET', '/provider/ring')).body.data.length, 0, 'a provider with dues must not be rung');

    // 2. Provider hands the cash in; still blocked until the office confirms.
    const paid = await call('provider', 'POST', '/provider/wallet/pay-dues', { method: 'cash' });
    assert.equal(paid.status, 201, JSON.stringify(paid.body));
    w = await wallet();
    assert.equal(w.duePending, 50);
    assert.equal(w.blocked, true);
    const dues = await call('admin', 'GET', '/admin/provider-payouts/dues');
    assert.equal(dues.status, 200, JSON.stringify(dues.body));
    assert.equal(dues.body.data.payments.length, 1);
    const confirmed = await call('admin', 'POST', `/admin/provider-payouts/dues/${paid.body.data._id}/mark`, { status: 'confirmed' });
    assert.equal(confirmed.status, 200, JSON.stringify(confirmed.body));
    w = await wallet();
    assert.equal(w.due, 0);
    assert.equal(w.blocked, false);
    // The waiting booking is cancelled so the next tests only see their own ring.
    await call('customer', 'POST', `/bookings/${blockedBooking.body.data._id}/cancel`, {});

    // 3. Online booking: the provider's share lands in the wallet and can be withdrawn.
    await bookAndComplete('online');
    w = await wallet();
    assert.equal(w.balance, 450);
    assert.equal(w.onlineEarned, 450);
    assert.equal(w.due, 0);
    const noAccount = await call('provider', 'POST', '/provider/wallet/withdraw', { amount: 300, method: 'upi' });
    assert.equal(noAccount.status, 400);
    assert.equal((await call('provider', 'POST', '/provider/wallet/account', { upi: 'provider@upi' })).status, 200);
    const tooMuch = await call('provider', 'POST', '/provider/wallet/withdraw', { amount: 451, method: 'upi' });
    assert.equal(tooMuch.status, 400);
    const withdrawal = await call('provider', 'POST', '/provider/wallet/withdraw', { amount: 300, method: 'upi' });
    assert.equal(withdrawal.status, 201, JSON.stringify(withdrawal.body));
    assert.equal((await wallet()).balance, 150);
    const list = await call('admin', 'GET', '/admin/provider-payouts/withdrawals');
    assert.equal(list.body.data.length, 1);
    assert.equal((await call('admin', 'POST', `/admin/provider-payouts/withdrawals/${withdrawal.body.data._id}/mark`, { status: 'paid', reference: 'UTR123' })).status, 200);
    w = await wallet();
    assert.equal(w.paidOut, 300);
    assert.equal(w.balance, 150);

    // 4. Another cash booking creates a due; it can be paid straight from the wallet (no office step).
    await bookAndComplete('cod');
    assert.equal((await wallet()).blocked, true);
    const fromWallet = await call('provider', 'POST', '/provider/wallet/pay-dues', { method: 'wallet' });
    assert.equal(fromWallet.status, 201, JSON.stringify(fromWallet.body));
    w = await wallet();
    assert.equal(w.due, 0);
    assert.equal(w.blocked, false);
    assert.equal(w.balance, 100);

    // 5. The admin can record a collection directly.
    await bookAndComplete('cod');
    const collected = await call('admin', 'POST', `/admin/provider-payouts/providers/${provider._id}/collect`, {});
    assert.equal(collected.status, 201, JSON.stringify(collected.body));
    assert.equal((await wallet()).due, 0);

    // 6. With a running plan there is no commission on cash bookings.
    await User.updateOne({ _id: provider._id }, { $set: { subscriptionUntil: new Date(Date.now() + 86_400_000) } });
    const planId = await bookAndComplete('cod');
    assert.equal((await ServiceBooking.findById(planId).lean())?.commission, 0);
    w = await wallet();
    assert.equal(w.due, 0);
    assert.equal(w.commissionPct, 0);

    // 7. The due limit lets a little commission build up before bookings stop.
    await User.updateOne({ _id: provider._id }, { $set: { subscriptionUntil: null } });
    await Settings.updateOne({ key: 'global' }, { $set: { 'providerPay.dueLimit': 100 } });
    clearSettingsCache();
    await bookAndComplete('cod');
    w = await wallet();
    assert.equal(w.due, 50);
    assert.equal(w.blocked, false);
  } finally {
    mock.restoreAll();
    server.close();
    await mongoose.disconnect();
    await db.stop();
  }
});
