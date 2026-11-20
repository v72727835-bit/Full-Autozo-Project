import './env';
import assert from 'node:assert/strict';
import { test } from 'node:test';
import mongoose from 'mongoose';
import { MongoMemoryServer } from 'mongodb-memory-server-core';
import app from '../src/app';
import { User } from '../src/models/User';
import { signAccessToken } from '../src/utils/jwt';

/* The super admin picks the colours once; every client reads them from /settings/public. */
test('the super admin sets the theme and every client gets it, resets, and bad colours are refused', { timeout: 900000 }, async () => {
  const db = await MongoMemoryServer.create({ binary: { version: '8.2.6' }, instance: { launchTimeout: 60000 } });
  await mongoose.connect(db.getUri());
  const server = app.listen(0, '127.0.0.1');
  await new Promise<void>((resolve) => server.once('listening', resolve));
  const base = `http://127.0.0.1:${(server.address() as { port: number }).port}/api/v1`;
  try {
    const admin = await User.create({ name: 'Super Admin', phone: '9000000000', password: 'test-password', role: 'admin', isSuperAdmin: true });
    const token = signAccessToken(String(admin._id), 'admin');
    const patch = (body: unknown) =>
      fetch(`${base}/admin/settings`, { method: 'PATCH', headers: { Authorization: `Bearer ${token}`, 'content-type': 'application/json' }, body: JSON.stringify(body) });
    const publicTheme = async () => ((await (await fetch(`${base}/settings/public`)).json()) as { data: { theme: any } }).data.theme;

    // 1. Nothing saved: no theme, so every client keeps its built-in colours.
    assert.equal(await publicTheme(), null);

    // 2. Brand + accent saved: the public settings carry the derived light and dark tokens.
    const saved = await patch({ theme: { brand: '#1A56DB', accent: '#FF5A00' } });
    assert.equal(saved.status, 200, JSON.stringify(await saved.clone().json()));
    const theme = await publicTheme();
    assert.equal(theme.source.brand, '#1a56db');
    assert.equal(theme.source.accent, '#ff5a00');
    assert.equal(theme.light.brand, '#1a56db');
    assert.match(theme.light.brandTint, /^#[0-9a-f]{6}$/);
    assert.match(theme.dark.brand, /^#[0-9a-f]{6}$/);
    assert.equal(theme.light.accent, '#ff5a00');

    // 3. A partial update keeps the other colour.
    assert.equal((await patch({ theme: { accent: '#00AA55' } })).status, 200);
    const partial = await publicTheme();
    assert.equal(partial.source.brand, '#1a56db');
    assert.equal(partial.source.accent, '#00aa55');

    // 4. A dark-mode brand can be chosen separately.
    assert.equal((await patch({ theme: { darkBrand: '#7CFFB2' } })).status, 200);
    assert.equal((await publicTheme()).dark.brand, '#7cffb2');

    // 5. Bad colours are refused and change nothing.
    for (const bad of ['blue', '#fff', '#12345g', '1a56db', '#1a56db00']) {
      assert.equal((await patch({ theme: { brand: bad } })).status, 400, `refuses ${bad}`);
    }
    assert.equal((await publicTheme()).source.brand, '#1a56db');

    // 6. Reset: empty strings clear the theme and every client goes back to its own colours.
    assert.equal((await patch({ theme: { brand: '', accent: '', darkBrand: '' } })).status, 200);
    assert.equal(await publicTheme(), null);
  } finally {
    server.close();
    await mongoose.disconnect();
    await db.stop();
  }
});
