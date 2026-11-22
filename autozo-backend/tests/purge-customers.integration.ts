import './env';
import assert from 'node:assert/strict';
import { test } from 'node:test';
import mongoose, { Types } from 'mongoose';
import { MongoMemoryServer } from 'mongodb-memory-server-core';
import app from '../src/app';
import { User } from '../src/models/User';
import { Order } from '../src/models/Order';
import { ServiceBooking } from '../src/models/ServiceBooking';
import { Cart } from '../src/models/Cart';
import { Review } from '../src/models/Review';
import { Ticket } from '../src/models/Ticket';
import { DeviceToken } from '../src/models/DeviceToken';
import { PaymentIntent } from '../src/models/PaymentIntent';
import { StockAlert } from '../src/models/StockAlert';
import { Dispatch } from '../src/models/Dispatch';
import { AdminAlert } from '../src/models/AdminAlert';
import { ProviderTxn } from '../src/models/ProviderTxn';
import { Product } from '../src/models/Product';
import { Service } from '../src/models/Service';
import { signAccessToken } from '../src/utils/jwt';

/* The super admin can wipe every customer (the people who book services and order) and all their data, and nothing else. */
test('super admin deletes all customers and their data; partners, admins and their records stay', { timeout: 900000 }, async () => {
  const db = await MongoMemoryServer.create({ binary: { version: '8.2.6' }, instance: { launchTimeout: 60000 } });
  await mongoose.connect(db.getUri());
  const server = app.listen(0, '127.0.0.1');
  await new Promise<void>((resolve) => server.once('listening', resolve));
  const base = `http://127.0.0.1:${(server.address() as { port: number }).port}/api/v1`;
  try {
    const sup = await User.create({ name: 'Super', phone: '9000000000', password: 'test-password', role: 'admin', isSuperAdmin: true });
    const sub = await User.create({ name: 'Sub', phone: '9000000009', password: 'test-password', role: 'admin', isSuperAdmin: false, adminPermissions: ['customers', 'users', 'orders', 'settings'] });
    const provider = await User.create({ name: 'Provider', phone: '9000000001', password: 'test-password', role: 'provider', providerStatus: 'approved', providerBusy: true });
    const rider = await User.create({ name: 'Rider', phone: '9000000002', password: 'test-password', role: 'rider' });
    const seller = await User.create({ name: 'Seller', phone: '9000000003', password: 'test-password', role: 'seller' });
    const c1 = await User.create({ name: 'Cust One', phone: '9000000011', password: 'test-password', role: 'customer' });
    const c2 = await User.create({ name: 'Cust Two', phone: '9000000012', password: 'test-password', role: 'customer' });
    const custIds = [c1._id, c2._id];

    const raw = (m: { collection: { insertOne: (d: object) => Promise<unknown> } }, d: object) => m.collection.insertOne(d);
    const productId = new Types.ObjectId();
    await raw(Product, { _id: productId, name: 'Milk', rating: 4.5, ratingCount: 2 });
    const serviceId = new Types.ObjectId();
    await raw(Service, { _id: serviceId, provider: provider._id, title: 'Tow', rating: 5, ratingCount: 1 });
    const bookingIds = [new Types.ObjectId(), new Types.ObjectId()];
    const orderIds = [new Types.ObjectId(), new Types.ObjectId()];
    for (const [i, c] of custIds.entries()) {
      await raw(ServiceBooking, { _id: bookingIds[i], customer: c, provider: provider._id, service: serviceId, status: i === 0 ? 'in_progress' : 'completed', rating: 5, bookingNumber: `BK-${i}` });
      await raw(Order, { _id: orderIds[i], user: c, rider: rider._id, status: 'delivered', orderNumber: `OR-${i}` });
      await raw(Cart, { user: c, items: [] });
      await raw(Review, { user: c, product: productId, rating: 4 + i });
      await raw(Ticket, { user: c, subject: 'Help' });
      await raw(DeviceToken, { user: c, token: `tok-${i}` });
      await raw(PaymentIntent, { user: c, amount: 100, razorpayOrderId: `rzp-${i}` });
      await raw(StockAlert, { user: c, product: productId, phone: `90000000${20 + i}` });
      await raw(Dispatch, { kind: 'booking', booking: bookingIds[i], status: 'searching' });
      await raw(AdminAlert, { user: c, kind: 'x' });
    }
    // Partner data that must survive.
    await raw(Ticket, { user: provider._id, subject: 'Provider help' });
    await raw(DeviceToken, { user: rider._id, token: 'rider-tok' });
    await raw(Dispatch, { kind: 'order', order: new Types.ObjectId(), status: 'searching' });
    await raw(ProviderTxn, { provider: provider._id, booking: bookingIds[1], kind: 'earning', amount: 90 });

    const call = async (who: { _id: unknown }, method: string, path: string, body?: unknown) => {
      const r = await fetch(base + path, { method, headers: { Authorization: `Bearer ${signAccessToken(String(who._id), 'admin')}`, 'Content-Type': 'application/json' }, body: body ? JSON.stringify(body) : undefined });
      return { status: r.status, body: (await r.json()) as any };
    };

    // 1. Preview shows what will go, and deletes nothing.
    const pre = await call(sup, 'GET', '/admin/customers/purge');
    assert.equal(pre.status, 200, JSON.stringify(pre.body));
    assert.equal(pre.body.data.customers, 2);
    assert.equal(pre.body.data.bookings, 2);
    assert.equal(pre.body.data.orders, 2);
    assert.equal(await User.countDocuments({ role: 'customer' }), 2);

    // 2. Only a super admin, and only with the typed confirmation.
    assert.equal((await call(sub, 'GET', '/admin/customers/purge')).status, 403);
    assert.equal((await call(sub, 'POST', '/admin/customers/purge', { confirm: 'DELETE' })).status, 403);
    assert.equal((await call(sup, 'POST', '/admin/customers/purge', {})).status, 400);
    assert.equal((await call(sup, 'POST', '/admin/customers/purge', { confirm: 'delete it' })).status, 400);
    assert.equal(await User.countDocuments({ role: 'customer' }), 2, 'nothing deleted yet');

    // 3. The real thing.
    const done = await call(sup, 'POST', '/admin/customers/purge', { confirm: 'DELETE' });
    assert.equal(done.status, 200, JSON.stringify(done.body));
    assert.equal(done.body.data.customers, 2);

    assert.equal(await User.countDocuments({ role: 'customer' }), 0);
    for (const [m, f] of [[ServiceBooking, 'customer'], [Order, 'user'], [Cart, 'user'], [Review, 'user'], [Ticket, 'user'], [DeviceToken, 'user'], [PaymentIntent, 'user'], [StockAlert, 'user'], [AdminAlert, 'user']] as const) {
      assert.equal(await (m as any).countDocuments({ [f]: { $in: custIds } }), 0, `${(m as any).modelName} cleared`);
    }
    assert.equal(await Dispatch.countDocuments({ booking: { $in: bookingIds } }), 0, 'their bookings stop ringing');

    // Everyone else and their records stay.
    assert.equal(await User.countDocuments({ _id: { $in: [sup._id, sub._id, provider._id, rider._id, seller._id] } }), 5);
    assert.equal(await Ticket.countDocuments({ user: provider._id }), 1);
    assert.equal(await DeviceToken.countDocuments({ user: rider._id }), 1);
    assert.equal(await Dispatch.countDocuments({ kind: 'order' }), 1);
    assert.equal(await ProviderTxn.countDocuments({ provider: provider._id }), 1, 'provider earnings history stays');

    // A provider who was on a deleted job is free again; ratings from deleted customers are gone.
    assert.equal((await User.findById(provider._id).lean())?.providerBusy, false);
    const p = await Product.findById(productId).lean();
    assert.equal(p?.rating, 0); assert.equal(p?.ratingCount, 0);
    const s = await Service.findById(serviceId).lean();
    assert.equal(s?.rating, 0); assert.equal(s?.ratingCount, 0);

    // 4. Running it again is harmless.
    const again = await call(sup, 'POST', '/admin/customers/purge', { confirm: 'DELETE' });
    assert.equal(again.status, 200);
    assert.equal(again.body.data.customers, 0);
  } finally {
    server.close();
    await mongoose.disconnect();
    await db.stop();
  }
});
