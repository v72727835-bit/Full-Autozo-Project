import './env';
import assert from 'node:assert/strict';
import { test } from 'node:test';
import mongoose from 'mongoose';
import { MongoMemoryServer } from 'mongodb-memory-server-core';
import app from '../src/app';
import { User } from '../src/models/User';
import { Service } from '../src/models/Service';
import { ServiceCategory } from '../src/models/ServiceCategory';
import { signAccessToken } from '../src/utils/jwt';

/* The super admin can see how far each provider serves, and change it. */
test('the super admin sees every provider\'s service radius and can change it', { timeout: 900000 }, async () => {
  const db = await MongoMemoryServer.create({ binary: { version: '8.2.6' }, instance: { launchTimeout: 60000 } });
  await mongoose.connect(db.getUri());
  const server = app.listen(0, '127.0.0.1');
  await new Promise<void>((resolve) => server.once('listening', resolve));
  const base = `http://127.0.0.1:${(server.address() as { port: number }).port}/api/v1`;
  try {
    const admin = await User.create({ name: 'Super Admin', phone: '9000000000', password: 'test-password', role: 'admin', isSuperAdmin: true });
    const here = { type: 'Point' as const, coordinates: [83.07, 24.7] as [number, number] };
    const mk = (phone: string, name: string, extra: Record<string, unknown> = {}) =>
      User.create({ name, phone, password: 'test-password', role: 'provider', providerStatus: 'approved', providerLocation: here, ...extra });
    const withRadius = await mk('9000000001', 'Set Radius', { providerRadiusKm: 25 });
    const perService = await mk('9000000002', 'Per Service');
    const noServices = await mk('9000000003', 'No Services');
    const category = await ServiceCategory.create({ name: 'Plumbing' });
    const svc = (provider: unknown, title: string, km: number) => Service.create({ provider, category: category._id, title, price: 100, location: here, serviceRadiusKm: km });
    await svc(withRadius._id, 'A', 25);
    await svc(perService._id, 'B', 5);
    await svc(perService._id, 'C', 40);

    const call = async (method: string, path: string, body?: unknown) => {
      const response = await fetch(base + path, { method, headers: { Authorization: `Bearer ${signAccessToken(String(admin._id), 'admin')}`, 'Content-Type': 'application/json' }, body: body ? JSON.stringify(body) : undefined });
      return { status: response.status, body: (await response.json()) as any };
    };
    const rowOf = async (id: unknown) => {
      const r = await call('GET', '/admin/providers?status=approved&limit=50');
      assert.equal(r.status, 200, JSON.stringify(r.body));
      return (r.body.data as any[]).find((p) => p._id === String(id));
    };

    // 1. A provider with a chosen radius shows it, and how many services follow it.
    const a = await rowOf(withRadius._id);
    assert.equal(a.serviceArea.radiusKm, 25);
    assert.equal(a.serviceArea.services, 1);

    // 2. A provider who set radii per service shows the range.
    const b = await rowOf(perService._id);
    assert.equal(b.serviceArea.radiusKm, null);
    assert.equal(b.serviceArea.services, 2);
    assert.equal(b.serviceArea.minKm, 5);
    assert.equal(b.serviceArea.maxKm, 40);

    // 3. A provider with no services yet still has a row, with nothing to show but no crash.
    const c = await rowOf(noServices._id);
    assert.equal(c.serviceArea.services, 0);
    assert.equal(c.serviceArea.radiusKm, null);

    // 4. The admin changes the radius: it is saved on the provider and applied to all their services.
    const changed = await call('PATCH', `/admin/providers/${perService._id}`, { serviceRadiusKm: 15 });
    assert.equal(changed.status, 200, JSON.stringify(changed.body));
    const b2 = await rowOf(perService._id);
    assert.equal(b2.serviceArea.radiusKm, 15);
    assert.equal(b2.serviceArea.minKm, 15);
    assert.equal(b2.serviceArea.maxKm, 15);
    assert.deepEqual((await Service.find({ provider: perService._id }).lean()).map((s) => s.serviceRadiusKm), [15, 15]);

    // 5. Limits are 1 and 100 km.
    for (const bad of [0, 101, -5]) assert.equal((await call('PATCH', `/admin/providers/${perService._id}`, { serviceRadiusKm: bad })).status, 400, `rejects ${bad}`);
    assert.equal((await call('PATCH', `/admin/providers/${perService._id}`, { serviceRadiusKm: 100 })).status, 200);
    assert.equal((await rowOf(perService._id)).serviceArea.radiusKm, 100);
  } finally {
    server.close();
    await mongoose.disconnect();
    await db.stop();
  }
});
