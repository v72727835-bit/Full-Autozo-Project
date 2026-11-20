import './env';
import assert from 'node:assert/strict';
import { test } from 'node:test';
import mongoose from 'mongoose';
import { MongoMemoryServer } from 'mongodb-memory-server-core';
import app from '../src/app';
import { User } from '../src/models/User';
import { Settings } from '../src/models/Settings';
import { signAccessToken } from '../src/utils/jwt';

/* Anyone can share Autozo with their own code; a new customer who signs up with it is recorded as theirs. */
test('everyone gets a personal referral code and a signup with it is credited to them', { timeout: 900000 }, async () => {
  const db = await MongoMemoryServer.create({ binary: { version: '8.2.6' }, instance: { launchTimeout: 60000 } });
  await mongoose.connect(db.getUri());
  const server = app.listen(0, '127.0.0.1');
  await new Promise<void>((resolve) => server.once('listening', resolve));
  const base = `http://127.0.0.1:${(server.address() as { port: number }).port}/api/v1`;
  try {
    await Settings.create({ key: 'global' });
    await User.syncIndexes();
    const alice = await User.create({ name: 'Alice', phone: '9000000001', password: 'test-password', role: 'customer' });
    const rider = await User.create({ name: 'Rider', phone: '9000000002', password: 'test-password', role: 'rider' });
    const provider = await User.create({ name: 'Provider', phone: '9000000003', password: 'test-password', role: 'provider', providerStatus: 'approved' });

    const referral = async (who: { _id: unknown; role: string } | null) => {
      const r = await fetch(`${base}/referral`, { headers: who ? { Authorization: `Bearer ${signAccessToken(String(who._id), who.role)}` } : {} });
      return { status: r.status, body: (await r.json()) as any };
    };
    const signup = async (name: string, phone: string, code?: string) => {
      const r = await fetch(`${base}/auth/register`, {
        method: 'POST', headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ name, phone, password: 'test-password', ...(code !== undefined ? { referralCode: code } : {}) }),
      });
      return { status: r.status, body: (await r.json()) as any };
    };

    // 1. A signed-in user (any role) gets a code; it is the same every time; a guest gets nothing.
    assert.equal((await referral(null)).status, 401);
    const a1 = await referral(alice);
    assert.equal(a1.status, 200, JSON.stringify(a1.body));
    assert.match(a1.body.data.code, /^[A-HJ-NP-Z2-9]{6,10}$/, 'short, upper case, no look-alike characters');
    assert.equal(a1.body.data.referred, 0);
    assert.equal((await referral(alice)).body.data.code, a1.body.data.code);
    const codes = new Set([a1.body.data.code, (await referral(rider)).body.data.code, (await referral(provider)).body.data.code]);
    assert.equal(codes.size, 3, 'every person has their own code');

    // 2. A new customer who signs up with Alice's code (typed any way) is credited to her.
    const code = a1.body.data.code as string;
    const bob = await signup('Bob', '9000000011', `  ${code.toLowerCase()} `);
    assert.equal(bob.status, 201, JSON.stringify(bob.body));
    assert.equal(String((await User.findOne({ phone: '9000000011' }).lean())?.referredBy), String(alice._id));
    assert.equal((await referral(alice)).body.data.referred, 1);

    // 3. A rider's code works too; two signups count two.
    const riderCode = (await referral(rider)).body.data.code as string;
    assert.equal((await signup('Carol', '9000000012', riderCode)).status, 201);
    assert.equal((await signup('Dan', '9000000013', code)).status, 201);
    assert.equal((await referral(alice)).body.data.referred, 2);
    assert.equal((await referral(rider)).body.data.referred, 1);

    // 4. A wrong or blank code never blocks a signup and credits nobody.
    for (const [i, bad] of ['NOPE1234', '', '   ', 'x'.repeat(15)].entries()) {
      const r = await signup(`Eve${i}`, `90000001${20 + i}`, bad);
      assert.equal(r.status, 201, `signup with "${bad}" still works: ${JSON.stringify(r.body)}`);
      assert.equal((await User.findOne({ phone: `90000001${20 + i}` }).lean())?.referredBy, undefined);
    }
    assert.equal((await referral(alice)).body.data.referred, 2, 'bad codes changed nothing');
  } finally {
    server.close();
    await mongoose.disconnect();
    await db.stop();
  }
});
