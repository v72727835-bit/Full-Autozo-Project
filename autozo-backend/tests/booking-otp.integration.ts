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

test('a service booking completes only with the OTP the customer sees', { timeout: 900000 }, async () => {
  const db = await MongoMemoryServer.create({ binary: { version: '8.2.6' }, instance: { launchTimeout: 60000 } });
  await mongoose.connect(db.getUri());
  const server = app.listen(0, '127.0.0.1');
  await new Promise<void>((resolve) => server.once('listening', resolve));
  const base = `http://127.0.0.1:${(server.address() as { port: number }).port}/api/v1`;
  try {
    // Dispatch searches by distance, so the geo indexes must exist before the first booking.
    await Promise.all([User.syncIndexes(), Service.syncIndexes()]);
    const customer = await User.create({ name: 'Booking Customer', phone: '9876543210', password: 'test-password', role: 'customer' });
    const provider = await User.create({ name: 'Booking Provider', phone: '9876543211', password: 'test-password', role: 'provider', providerStatus: 'approved', providerLocation: { type: 'Point', coordinates: [83.07, 24.7] } });
    const category = await ServiceCategory.create({ name: 'Plumbing' });
    const service = await Service.create({ provider: provider._id, category: category._id, title: 'Tap repair', price: 199, location: { type: 'Point', coordinates: [83.07, 24.7] } });

    const call = async (who: 'customer' | 'provider', method: string, path: string, body?: unknown) => {
      const user = who === 'customer' ? customer : provider;
      const response = await fetch(base + path, {
        method,
        headers: { Authorization: `Bearer ${signAccessToken(String(user._id), who)}`, 'Content-Type': 'application/json' },
        body: body === undefined ? undefined : JSON.stringify(body),
      });
      return { status: response.status, body: await response.json() as any };
    };

    const placed = await call('customer', 'POST', '/bookings', {
      serviceId: String(service._id),
      paymentMethod: 'cod',
      address: { name: 'Booking Customer', phone: '9876543210', line1: 'House 12, Main road', city: 'Robertsganj', state: 'UP', pincode: '231216' },
    });
    assert.equal(placed.status, 201, JSON.stringify(placed.body));
    const bookingId = placed.body.data._id as string;

    // The OTP the customer is shown on the website / app.
    const seen = await call('customer', 'GET', `/bookings/${bookingId}`);
    const otp = seen.body.data.completionOtp as string;
    assert.match(otp, /^\d{4}$/);

    const ring = await call('provider', 'GET', '/provider/ring');
    assert.equal(ring.body.data.length, 1, JSON.stringify(ring.body));
    const accepted = await call('provider', 'POST', `/provider/ring/${ring.body.data[0].dispatchId}/accept`);
    assert.equal(accepted.status, 200, JSON.stringify(accepted.body));
    assert.equal(accepted.body.data.completionOtp, undefined, 'the provider must never receive the OTP');

    for (const status of ['on_the_way', 'in_progress']) {
      const moved = await call('provider', 'PATCH', `/provider/bookings/${bookingId}/status`, { status });
      assert.equal(moved.status, 200, JSON.stringify(moved.body));
    }

    // The customer's OTP is unchanged by the provider's steps.
    assert.equal((await call('customer', 'GET', `/bookings/${bookingId}`)).body.data.completionOtp, otp);

    const number = placed.body.data.bookingNumber as string;
    const missing = await call('provider', 'PATCH', `/provider/bookings/${bookingId}/status`, { status: 'completed' });
    assert.equal(missing.status, 400);
    assert.match(missing.body.message, /Enter the 4-digit completion OTP/);

    const wrong = String((Number(otp) + 1) % 10000).padStart(4, '0');
    const rejected = await call('provider', 'PATCH', `/provider/bookings/${bookingId}/status`, { status: 'completed', otp: wrong });
    assert.equal(rejected.status, 400);
    assert.ok(rejected.body.message.includes(`Wrong OTP for booking ${number}`), rejected.body.message);
    assert.equal((await ServiceBooking.findById(bookingId))?.status, 'in_progress');

    // Typed with a space (or sent as a number) it is still the same OTP.
    const done = await call('provider', 'PATCH', `/provider/bookings/${bookingId}/status`, { status: 'completed', otp: `${otp.slice(0, 2)} ${otp.slice(2)}` });
    assert.equal(done.status, 200, JSON.stringify(done.body));
    assert.equal(done.body.data.status, 'completed');
    assert.equal((await ServiceBooking.findById(bookingId))?.status, 'completed');
  } finally {
    server.close();
    await mongoose.disconnect();
    await db.stop();
  }
});
