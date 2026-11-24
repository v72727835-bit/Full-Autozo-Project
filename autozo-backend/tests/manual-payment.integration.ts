import './env';
import assert from 'node:assert/strict';
import { test } from 'node:test';
import mongoose, { Types } from 'mongoose';
import { MongoMemoryServer } from 'mongodb-memory-server-core';
import app from '../src/app';
import { User } from '../src/models/User';
import { Order } from '../src/models/Order';
import { ProviderTxn } from '../src/models/ProviderTxn';
import { SubscriptionPlan } from '../src/models/SubscriptionPlan';
import { signAccessToken } from '../src/utils/jwt';

/*
 * Manual payment: the admin puts a QR / UPI id / bank details in the panel, riders, providers and
 * warehouses see them, pay outside the app and send the transaction id. It stays Pending until the
 * admin confirms the money arrived (then it is Successful and the dues / plan are applied), or rejects it.
 */
test('manual payment: admin sets details, partners pay and submit, admin confirms or rejects', { timeout: 900000 }, async () => {
  const db = await MongoMemoryServer.create({ binary: { version: '8.2.6' }, instance: { launchTimeout: 60000 } });
  await mongoose.connect(db.getUri());
  const server = app.listen(0, '127.0.0.1');
  await new Promise<void>((resolve) => server.once('listening', resolve));
  const base = `http://127.0.0.1:${(server.address() as { port: number }).port}/api/v1`;
  try {
    const admin = await User.create({ name: 'Super', phone: '9000000000', password: 'test-password', role: 'admin', isSuperAdmin: true });
    const subAdmin = await User.create({ name: 'Sub', phone: '9000000009', password: 'test-password', role: 'admin', isSuperAdmin: false, adminPermissions: ['orders'] });
    const rider = await User.create({ name: 'Rider', phone: '9000000001', password: 'test-password', role: 'rider' });
    const provider = await User.create({ name: 'Provider', phone: '9000000002', password: 'test-password', role: 'provider', providerStatus: 'approved' });
    const seller = await User.create({ name: 'Warehouse', phone: '9000000003', password: 'test-password', role: 'seller', sellerStatus: 'approved' });
    const customer = await User.create({ name: 'Cust', phone: '9000000004', password: 'test-password', role: 'customer' });
    const who = { admin, subAdmin, rider, provider, seller, customer } as const;
    const call = async (k: keyof typeof who, method: string, path: string, body?: unknown) => {
      const u = who[k];
      const r = await fetch(base + path, { method, headers: { Authorization: `Bearer ${signAccessToken(String(u._id), u.role)}`, 'content-type': 'application/json' }, body: body === undefined ? undefined : JSON.stringify(body) });
      return { status: r.status, body: (await r.json()) as any };
    };

    // 1. Before the admin sets anything, partners are told manual payment is not available.
    assert.equal((await call('rider', 'GET', '/manual-payment/info')).body.data.enabled, false);
    assert.equal((await call('rider', 'POST', '/manual-payment', { purpose: 'rider_cash', amount: 100, method: 'upi', reference: 'UTR123456789' })).status, 400);

    // 2. The admin sets the details; only an admin with the payouts permission can.
    const details = { enabled: true, upiId: 'autozo@upi', payeeName: 'Autozo Retail', qrImage: 'https://example.com/qr.png', bankHolder: 'Autozo Retail', bankName: 'SBI', bankNumber: '123456789012', bankIfsc: 'SBIN0001234', note: 'Send the screenshot too' };
    assert.equal((await call('subAdmin', 'PUT', '/admin/manual-payment/config', details)).status, 403);
    assert.equal((await call('admin', 'PUT', '/admin/manual-payment/config', details)).status, 200);
    assert.equal((await call('admin', 'PUT', '/admin/manual-payment/config', { ...details, upiId: 'not a upi' })).status, 400);

    // 3. Rider, provider and warehouse see them; a customer does not.
    for (const k of ['rider', 'provider', 'seller'] as const) {
      const info = await call(k, 'GET', '/manual-payment/info');
      assert.equal(info.status, 200, k);
      assert.equal(info.body.data.enabled, true);
      assert.equal(info.body.data.upiId, 'autozo@upi');
      assert.equal(info.body.data.bankNumber, '123456789012');
      assert.equal(info.body.data.qrImage, 'https://example.com/qr.png');
    }
    assert.equal((await call('customer', 'GET', '/manual-payment/info')).status, 403);

    // ---- Rider: cash owed (two delivered COD orders, Rs 300 + Rs 200) ----
    const delivered = async (total: number, minutesAgo: number) => {
      const at = new Date(Date.now() - minutesAgo * 60_000);
      await Order.collection.insertOne({ orderNumber: `AZ-${total}`, user: new Types.ObjectId(), shop: new Types.ObjectId(), rider: rider._id, status: 'delivered', paymentMethod: 'cod', items: [], subtotal: total, deliveryFee: 0, discount: 0, total, codSettled: false, statusHistory: [], createdAt: at, updatedAt: at, deliveredAt: at });
    };
    await delivered(300, 20); await delivered(200, 10);
    const owed = async () => (await call('rider', 'GET', '/rider/wallet')).body.data.codPending as number;
    assert.equal(await owed(), 500);

    // Validation: needs a transaction id, and cannot pay more than is owed.
    assert.equal((await call('rider', 'POST', '/manual-payment', { purpose: 'rider_cash', amount: 300, method: 'upi' })).status, 400);
    assert.equal((await call('rider', 'POST', '/manual-payment', { purpose: 'rider_cash', amount: 9999, method: 'upi', reference: 'UTR123456789' })).status, 400);

    const p1 = await call('rider', 'POST', '/manual-payment', { purpose: 'rider_cash', amount: 300, method: 'upi', reference: 'UTR123456789' });
    assert.equal(p1.status, 201, JSON.stringify(p1.body));
    assert.equal(p1.body.data.status, 'pending');
    // Still pending: nothing cleared yet, and a second one is refused while it waits.
    assert.equal(await owed(), 500);
    assert.equal((await call('rider', 'POST', '/manual-payment', { purpose: 'rider_cash', amount: 200, method: 'bank', reference: 'NEFT987654321' })).status, 409);
    const mine = await call('rider', 'GET', '/manual-payment/mine');
    assert.equal(mine.body.data[0].status, 'pending');

    // The admin sees it and rejects it (money not received): the rider is told, nothing changes.
    // The admin panel asks for the biggest page the API allows.
    assert.equal((await call('admin', 'GET', '/admin/manual-payments?status=pending&limit=50')).status, 200);
    const list = await call('admin', 'GET', '/admin/manual-payments?status=pending');
    assert.equal(list.status, 200, JSON.stringify(list.body));
    assert.equal(list.body.data.length, 1);
    assert.equal(list.body.data[0].user.name, 'Rider');
    assert.equal((await call('subAdmin', 'GET', '/admin/manual-payments')).status, 403);
    assert.equal((await call('rider', 'POST', `/admin/manual-payments/${p1.body.data._id}/reject`, {})).status, 403);
    assert.equal((await call('admin', 'POST', `/admin/manual-payments/${p1.body.data._id}/reject`, { reason: 'Money not received' })).status, 200);
    assert.equal((await call('rider', 'GET', '/manual-payment/mine')).body.data[0].status, 'rejected');
    assert.equal(await owed(), 500);

    // Pays again; the admin confirms: Successful, and the oldest order (Rs 300) clears.
    const p2 = await call('rider', 'POST', '/manual-payment', { purpose: 'rider_cash', amount: 300, method: 'upi', reference: 'UTR555555555' });
    assert.equal(p2.status, 201);
    assert.equal((await call('admin', 'POST', `/admin/manual-payments/${p2.body.data._id}/confirm`, {})).status, 200);
    assert.equal((await call('rider', 'GET', '/manual-payment/mine')).body.data[0].status, 'confirmed');
    assert.equal(await owed(), 200);
    // Handled once: confirming or rejecting again is refused and changes nothing.
    assert.equal((await call('admin', 'POST', `/admin/manual-payments/${p2.body.data._id}/confirm`, {})).status, 409);
    assert.equal((await call('admin', 'POST', `/admin/manual-payments/${p2.body.data._id}/reject`, {})).status, 409);
    assert.equal(await owed(), 200);

    // ---- Provider: commission due Rs 400 ----
    await ProviderTxn.create({ provider: provider._id, kind: 'commission', amount: 400, status: 'completed', paymentMethod: 'cod' });
    const due = async () => (await call('provider', 'GET', '/provider/wallet')).body.data.due as number;
    assert.equal(await due(), 400);
    assert.equal((await call('provider', 'POST', '/manual-payment', { purpose: 'provider_dues', amount: 500, method: 'bank', reference: 'NEFT111222333' })).status, 400, 'cannot pay more than due');
    const pp = await call('provider', 'POST', '/manual-payment', { purpose: 'provider_dues', amount: 400, method: 'bank', reference: 'NEFT111222333' });
    assert.equal(pp.status, 201, JSON.stringify(pp.body));
    const w = (await call('provider', 'GET', '/provider/wallet')).body.data;
    assert.equal(w.duePending, 400, 'shows as waiting for the office');
    assert.equal((await call('admin', 'POST', `/admin/manual-payments/${pp.body.data._id}/confirm`, {})).status, 200);
    assert.equal(await due(), 0);

    // ---- Warehouse: buys a plan (price set by the server, not the client) ----
    const plan = await SubscriptionPlan.create({ audience: 'seller', name: 'Monthly', price: 999, days: 30, active: true });
    assert.equal((await call('seller', 'POST', '/manual-payment', { purpose: 'subscription', planId: String(plan._id), amount: 1, method: 'upi', reference: 'UTR777777777' })).body.data.amount, 999);
    const sp = (await call('seller', 'GET', '/manual-payment/mine')).body.data[0];
    assert.equal(sp.status, 'pending');
    assert.equal((await User.findById(seller._id).lean())?.subscriptionUntil ?? null, null, 'no plan until confirmed');
    assert.equal((await call('admin', 'POST', `/admin/manual-payments/${sp._id}/confirm`, {})).status, 200);
    const until = (await User.findById(seller._id).lean())?.subscriptionUntil;
    assert.ok(until && until.getTime() > Date.now() + 29 * 86_400_000, 'plan days added once confirmed');
    // A plan for another audience is refused.
    const riderPlan = await SubscriptionPlan.create({ audience: 'rider', name: 'Rider', price: 99, days: 7, active: true });
    assert.equal((await call('seller', 'POST', '/manual-payment', { purpose: 'subscription', planId: String(riderPlan._id), amount: 99, method: 'upi', reference: 'UTR888888888' })).status, 404);
    // A rider cannot submit provider dues.
    assert.equal((await call('rider', 'POST', '/manual-payment', { purpose: 'provider_dues', amount: 10, method: 'upi', reference: 'UTR999999999' })).status, 403);
  } finally {
    server.close();
    await mongoose.disconnect();
    await db.stop();
  }
});
