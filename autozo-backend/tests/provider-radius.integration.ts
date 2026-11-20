import './env';
import assert from 'node:assert/strict';
import { test } from 'node:test';
import mongoose from 'mongoose';
import { MongoMemoryServer } from 'mongodb-memory-server-core';
import app from '../src/app';
import { User } from '../src/models/User';
import { Service } from '../src/models/Service';
import { ServiceCategory } from '../src/models/ServiceCategory';
import { bookingCandidates } from '../src/services/dispatch.service';
import { signAccessToken } from '../src/utils/jwt';

/*
 * A provider chooses how far from their own location they will serve. Customers beyond that
 * distance do not see the service, cannot book it, and the provider's phone is not rung for them.
 */
const KM_PER_DEG_LAT = 111.195;
const north = (lat: number, km: number) => lat + km / KM_PER_DEG_LAT;

test('a provider serves only as far as the radius they set', { timeout: 900000 }, async () => {
  const db = await MongoMemoryServer.create({ binary: { version: '8.2.6' }, instance: { launchTimeout: 60000 } });
  await mongoose.connect(db.getUri());
  const server = app.listen(0, '127.0.0.1');
  await new Promise<void>((resolve) => server.once('listening', resolve));
  const base = `http://127.0.0.1:${(server.address() as { port: number }).port}/api/v1`;
  try {
    await Promise.all([User.syncIndexes(), Service.syncIndexes()]);
    const home = { lat: 24.7, lng: 83.07 };
    const customer = await User.create({ name: 'Customer', phone: '9876543210', password: 'test-password', role: 'customer' });
    const provider = await User.create({ name: 'Provider', phone: '9876543211', password: 'test-password', role: 'provider', providerStatus: 'approved', providerLocation: { type: 'Point', coordinates: [home.lng, home.lat] } });
    const category = await ServiceCategory.create({ name: 'Plumbing' });
    const here = { type: 'Point' as const, coordinates: [home.lng, home.lat] as [number, number] };
    const tap = await Service.create({ provider: provider._id, category: category._id, title: 'Tap repair', price: 199, location: here });
    const pipe = await Service.create({ provider: provider._id, category: category._id, title: 'Pipe fitting', price: 299, location: here, serviceRadiusKm: 40 });

    const call = async (who: 'customer' | 'provider', method: string, path: string, body?: unknown) => {
      const user = who === 'customer' ? customer : provider;
      const response = await fetch(base + path, {
        method,
        headers: { Authorization: `Bearer ${signAccessToken(String(user._id), who)}`, 'Content-Type': 'application/json' },
        body: body === undefined ? undefined : JSON.stringify(body),
      });
      return { status: response.status, body: (await response.json()) as any };
    };
    const titlesAt = async (km: number) => {
      const r = await call('customer', 'GET', `/services?lat=${north(home.lat, km)}&lng=${home.lng}&maxKm=100`);
      assert.equal(r.status, 200, JSON.stringify(r.body));
      return (r.body.data as { title: string }[]).map((s) => s.title).sort();
    };
    const book = (service: { _id: unknown }, km: number) =>
      call('customer', 'POST', '/bookings', {
        serviceId: String(service._id),
        paymentMethod: 'cod',
        address: { name: 'Customer', phone: '9876543210', line1: 'House 12, Main road', city: 'Robertsganj', state: 'UP', pincode: '231216', location: { lat: north(home.lat, km), lng: home.lng } },
      });

    // 1. Default radius is 10 km: the 10 km tap service shows at 5 km and not at 15 km; the 40 km one shows at both.
    assert.deepEqual(await titlesAt(5), ['Pipe fitting', 'Tap repair']);
    assert.deepEqual(await titlesAt(15), ['Pipe fitting']);
    assert.deepEqual(await titlesAt(9.9), ['Pipe fitting', 'Tap repair'], 'just inside the radius is served');
    assert.deepEqual(await titlesAt(10.1), ['Pipe fitting'], 'just outside the radius is not');

    // 2. Booking beyond the radius is refused with the distance in the message; inside it works.
    const tooFar = await book(tap, 15);
    assert.equal(tooFar.status, 400, JSON.stringify(tooFar.body));
    assert.match(String(tooFar.body.message ?? tooFar.body.error?.message ?? JSON.stringify(tooFar.body)), /10 km/);
    assert.equal((await book(tap, 5)).status, 201);

    // 3. The provider sets one radius for everything they offer; limits are 1 and 100 km.
    for (const bad of [0, 0.5, 101, 'far']) {
      assert.equal((await call('provider', 'PATCH', '/provider/service-radius', { serviceRadiusKm: bad })).status, 400, `rejects ${bad}`);
    }
    assert.equal((await call('provider', 'PATCH', '/provider/service-radius', { serviceRadiusKm: 1 })).status, 200);
    assert.deepEqual(await titlesAt(2), [], 'at 1 km nothing is served 2 km away');
    const set = await call('provider', 'PATCH', '/provider/service-radius', { serviceRadiusKm: 100 });
    assert.equal(set.status, 200, JSON.stringify(set.body));
    assert.equal(set.body.data.serviceRadiusKm, 100);
    assert.deepEqual(await titlesAt(60), ['Pipe fitting', 'Tap repair'], 'every service of the provider follows the new radius');
    assert.equal((await call('provider', 'GET', '/provider/me')).body.data.providerRadiusKm, 100);

    // 4. A new service starts with the provider's radius.
    const created = await call('provider', 'POST', '/provider/services', {
      category: String(category._id), title: 'Tank cleaning', price: 499, description: 'Full tank cleaning with tools and disposal.',
    });
    assert.equal(created.status, 201, JSON.stringify(created.body));
    assert.equal(created.body.data.serviceRadiusKm, 100);

    // 5. The ring respects the provider's own radius: a customer 20 km away rings a 100 km provider only.
    const small = await User.create({ name: 'Near Only', phone: '9876543212', password: 'test-password', role: 'provider', providerStatus: 'approved', providerLocation: { type: 'Point', coordinates: [home.lng, home.lat] } });
    await Service.create({ provider: small._id, category: category._id, title: 'Small area', price: 99, location: here, serviceRadiusKm: 3 });
    const center: [number, number] = [home.lng, north(home.lat, 20)];
    const rung = (await bookingCandidates(center, category._id, 50, new Set())).map((c) => c.user);
    assert.ok(rung.includes(String(provider._id)), 'the 100 km provider is rung');
    assert.ok(!rung.includes(String(small._id)), 'the 3 km provider is not rung for a customer 20 km away');
  } finally {
    server.close();
    await mongoose.disconnect();
    await db.stop();
  }
});
