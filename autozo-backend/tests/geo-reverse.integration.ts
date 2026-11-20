import './env';
import assert from 'node:assert/strict';
import { test, mock } from 'node:test';
import mongoose from 'mongoose';
import { MongoMemoryServer } from 'mongodb-memory-server-core';
import app from '../src/app';

/*
 * The apps and the website turn a pin into city / state / PIN / address through our own endpoint, so
 * every form fills the same way and OpenStreetMap is asked politely (identified, cached, one place).
 */
test('GET /geo/reverse turns a pin into city, state, PIN and address, caches it and never errors out', { timeout: 900000 }, async () => {
  const db = await MongoMemoryServer.create({ binary: { version: '8.2.6' }, instance: { launchTimeout: 60000 } });
  await mongoose.connect(db.getUri());
  const server = app.listen(0, '127.0.0.1');
  await new Promise<void>((resolve) => server.once('listening', resolve));
  const base = `http://127.0.0.1:${(server.address() as { port: number }).port}/api/v1`;
  const originalFetch = globalThis.fetch;
  let upstream = 0;
  let lastHeaders: Record<string, string> = {};
  let reply: () => Response = () => new Response('{}', { status: 200 });
  try {
    // OpenStreetMap is faked: no real lookup happens in this test.
    mock.method(globalThis, 'fetch', async (url: any, options: any) => {
      if (!String(url).startsWith('https://nominatim.openstreetmap.org/')) return originalFetch(url, options);
      upstream++;
      lastHeaders = options?.headers ?? {};
      return reply();
    });
    const geo = async (lat: unknown, lng: unknown) => {
      const r = await originalFetch(`${base}/geo/reverse?lat=${lat}&lng=${lng}`);
      return { status: r.status, body: (await r.json()) as any };
    };
    const address = (a: Record<string, string>) => () => new Response(JSON.stringify({ address: a, display_name: 'somewhere' }), { status: 200 });

    // 1. A normal result.
    reply = address({ house_number: '12', road: 'Main Road', suburb: 'Sanganer', city: 'Jaipur', state: 'Rajasthan', postcode: '302 029' });
    const a = await geo(26.8142, 75.7732);
    assert.equal(a.status, 200, JSON.stringify(a.body));
    assert.deepEqual(a.body.data, { found: true, city: 'Jaipur', state: 'Rajasthan', pincode: '302029', line1: '12, Main Road', area: 'Sanganer' });
    assert.match(String(lastHeaders['User-Agent'] ?? lastHeaders['user-agent']), /Autozo/, 'OpenStreetMap is told who is asking');

    // 2. The same spot again (even a few metres away) comes from the cache.
    const before = upstream;
    await geo(26.81421, 75.77321);
    assert.equal(upstream, before, 'no second lookup for the same place');

    // 3. State names are matched to our list; town / village stand in for a city.
    reply = address({ town: 'Robertsganj', state: 'NCT of Delhi', postcode: '231216' });
    const b = await geo(24.6911, 83.0712);
    assert.equal(b.body.data.city, 'Robertsganj');
    assert.equal(b.body.data.state, 'Delhi');
    assert.equal(b.body.data.line1, undefined);

    // 4. OpenStreetMap down or garbled: a normal answer saying nothing was found, never a 5xx.
    reply = () => new Response('nope', { status: 503 });
    const c = await geo(10.1234, 76.5678);
    assert.equal(c.status, 200);
    assert.equal(c.body.data.found, false);
    reply = () => { throw new Error('network down'); };
    assert.equal((await geo(11.1234, 77.5678)).body.data.found, false);

    // 5. Bad coordinates are refused.
    for (const [lat, lng] of [[91, 80], [-91, 80], [20, 181], ['x', 80], ['', '']]) {
      assert.equal((await geo(lat, lng)).status, 400, `rejects ${lat},${lng}`);
    }
  } finally {
    mock.restoreAll();
    server.close();
    await mongoose.disconnect();
    await db.stop();
  }
});
