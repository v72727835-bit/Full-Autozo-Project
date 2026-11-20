import './env';
import assert from 'node:assert/strict';
import { test } from 'node:test';
import mongoose from 'mongoose';
import { MongoMemoryServer } from 'mongodb-memory-server-core';
import app from '../src/app';
import { User } from '../src/models/User';
import { Service } from '../src/models/Service';
import { ServiceCategory } from '../src/models/ServiceCategory';
import { ServiceBooking } from '../src/models/ServiceBooking';
import { signAccessToken } from '../src/utils/jwt';
import { fareForKm } from '../src/services/fare.service';

test('fareForKm: base fee covers the included km, each extra km costs the rate', () => {
  const rule = { baseFee: 500, includedKm: 5, perKmRate: 40 };
  assert.equal(fareForKm(rule, 0), 500);
  assert.equal(fareForKm(rule, 5), 500);
  assert.equal(fareForKm(rule, 18), 500 + 13 * 40);
  assert.equal(fareForKm(rule, 5.5), 520, 'partial km is charged pro rata');
  assert.equal(fareForKm({ baseFee: 300, includedKm: 0, perKmRate: 25 }, 10), 550);
  assert.equal(fareForKm({ baseFee: 0, includedKm: 0, perKmRate: 12.5 }, 3), 38, 'rounded to whole rupees');
  assert.throws(() => fareForKm(rule, -1));
});

test('a per-km service is priced from the distance, at booking and at completion', { timeout: 900000 }, async () => {
  const db = await MongoMemoryServer.create({ binary: { version: '8.2.6' }, instance: { launchTimeout: 60000 } });
  await mongoose.connect(db.getUri());
  const server = app.listen(0, '127.0.0.1');
  await new Promise<void>((resolve) => server.once('listening', resolve));
  const base = `http://127.0.0.1:${(server.address() as { port: number }).port}/api/v1`;
  try {
    await Promise.all([User.syncIndexes(), Service.syncIndexes()]);
    const here = { type: 'Point' as const, coordinates: [83.07, 24.7] as [number, number] };
    const customer = await User.create({ name: 'Tow Customer', phone: '9876543210', password: 'test-password', role: 'customer' });
    const provider = await User.create({ name: 'Tow Provider', phone: '9876543211', password: 'test-password', role: 'provider', providerStatus: 'approved', providerLocation: here });
    const category = await ServiceCategory.create({ name: 'Towing' });
    const tow = await Service.create({ provider: provider._id, category: category._id, title: 'Car towing', price: 500, priceUnit: 'per_km', includedKm: 5, perKmRate: 40, location: here });
    const fixed = await Service.create({ provider: provider._id, category: category._id, title: 'Tap repair', price: 199, location: here });

    const call = async (who: 'customer' | 'provider' | null, method: string, path: string, body?: unknown) => {
      const user = who === 'customer' ? customer : provider;
      const response = await fetch(base + path, {
        method,
        headers: { ...(who ? { Authorization: `Bearer ${signAccessToken(String(user._id), who)}` } : {}), 'Content-Type': 'application/json' },
        body: body === undefined ? undefined : JSON.stringify(body),
      });
      return { status: response.status, body: (await response.json()) as any };
    };
    const address = { name: 'Tow Customer', phone: '9876543210', line1: 'House 12, Main road', city: 'Robertsganj', state: 'UP', pincode: '231216' };
    const book = (serviceId: unknown, extra: Record<string, unknown> = {}) => call('customer', 'POST', '/bookings', { serviceId: String(serviceId), paymentMethod: 'cod', address, ...extra });

    // 1. Anyone can see the price for a distance before booking.
    const quote = await call(null, 'GET', `/services/${tow._id}/quote?km=18`);
    assert.equal(quote.status, 200, JSON.stringify(quote.body));
    assert.equal(quote.body.data.fare, 1020);
    assert.equal(quote.body.data.baseFee, 500);
    assert.equal(quote.body.data.extraKm, 13);
    assert.equal((await call(null, 'GET', `/services/${tow._id}/quote`)).status, 400, 'a distance is needed');
    assert.equal((await call(null, 'GET', `/services/${fixed._id}/quote?km=3`)).body.data.fare, 199, 'a fixed service quotes its price');

    // 2. Booking a per-km service needs the distance; the price follows it.
    assert.equal((await book(tow._id)).status, 400, 'distance is required');
    assert.equal((await book(tow._id, { distanceKm: 0 })).status, 400);
    const placed = await book(tow._id, { distanceKm: 18 });
    assert.equal(placed.status, 201, JSON.stringify(placed.body));
    assert.equal(placed.body.data.price, 1020);
    assert.equal(placed.body.data.distanceKm, 18);
    const id = placed.body.data._id as string;
    // A fixed service ignores any distance.
    assert.equal((await book(fixed._id, { distanceKm: 40 })).body.data.price, 199);

    // 3. The provider needs the rates on a per-km listing.
    assert.equal((await call('provider', 'PATCH', `/provider/services/${fixed._id}`, { priceUnit: 'per_km' })).status, 400);
    assert.equal((await call('provider', 'PATCH', `/provider/services/${fixed._id}`, { priceUnit: 'per_km', perKmRate: 30, includedKm: 2 })).status, 200);

    // 4. After the trip the provider confirms the real distance (cash) and the price is recalculated.
    const otp = (await call('customer', 'GET', `/bookings/${id}`)).body.data.completionOtp as string;
    const ring = await call('provider', 'GET', '/provider/ring');
    const rung = (ring.body.data as any[]).find((r) => r.booking?._id === id || r.bookingId === id) ?? ring.body.data[0];
    assert.equal((await call('provider', 'POST', `/provider/ring/${rung.dispatchId}/accept`)).status, 200);
    for (const status of ['on_the_way', 'in_progress']) assert.equal((await call('provider', 'PATCH', `/provider/bookings/${id}/status`, { status })).status, 200);
    const done = await call('provider', 'PATCH', `/provider/bookings/${id}/status`, { status: 'completed', otp, distanceKm: 25 });
    assert.equal(done.status, 200, JSON.stringify(done.body));
    const saved = await ServiceBooking.findById(id).lean();
    assert.equal(saved?.distanceKm, 25);
    assert.equal(saved?.price, 500 + 20 * 40);
    assert.equal(saved?.snapshot.price, 500, 'the snapshot keeps the base fee');
  } finally {
    server.close();
    await mongoose.disconnect();
    await db.stop();
  }
});
