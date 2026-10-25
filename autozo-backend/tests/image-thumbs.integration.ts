import './env';
import assert from 'node:assert/strict';
import { test } from 'node:test';
import mongoose from 'mongoose';
import { MongoMemoryServer } from 'mongodb-memory-server-core';
import app from '../src/app';
import { User } from '../src/models/User';
import { signAccessToken } from '../src/utils/jwt';

const png = (n: number) => new Blob([Buffer.concat([Buffer.from([0x89, 0x50, 0x4e, 0x47]), Buffer.alloc(n, 7)])], { type: 'image/png' });

test('uploads store a small copy, ?w=480 serves it, and older photos can be given one', { timeout: 900000 }, async () => {
  const db = await MongoMemoryServer.create({ binary: { version: '8.2.6' }, instance: { launchTimeout: 60000 } });
  await mongoose.connect(db.getUri());
  const server = app.listen(0, '127.0.0.1');
  await new Promise<void>((resolve) => server.once('listening', resolve));
  const root = `http://127.0.0.1:${(server.address() as { port: number }).port}`;
  try {
    const admin = await User.create({ name: 'Admin', phone: '9876500000', password: 'test-password', role: 'admin' });
    const auth = { Authorization: `Bearer ${signAccessToken(String(admin._id), admin.role)}` };

    // A full photo with its small copy, and one without.
    const form = new FormData();
    form.append('images', png(5000), 'a.png');
    form.append('thumbs', png(300), 'a-thumb.png');
    const withThumb = await fetch(`${root}/api/v1/admin/uploads/images`, { method: 'POST', headers: auth, body: form });
    assert.equal(withThumb.status, 200);
    const [url] = ((await withThumb.json()) as any).data.urls as string[];
    const path = new URL(url).pathname;

    const full = await fetch(root + path);
    assert.equal(full.status, 200);
    assert.equal((await full.arrayBuffer()).byteLength, 5004);
    const small = await fetch(`${root}${path}?w=480`);
    assert.equal((await small.arrayBuffer()).byteLength, 304);
    // Served again from memory, same bytes.
    assert.equal((await (await fetch(`${root}${path}?w=480`)).arrayBuffer()).byteLength, 304);
    // Ranges still work for players.
    const ranged = await fetch(root + path, { headers: { Range: 'bytes=0-9' } });
    assert.equal(ranged.status, 206);
    assert.equal((await ranged.arrayBuffer()).byteLength, 10);

    const plain = new FormData();
    plain.append('images', png(4000), 'b.png');
    const old = await fetch(`${root}/api/v1/admin/uploads/images`, { method: 'POST', headers: auth, body: plain });
    const oldPath = new URL((((await old.json()) as any).data.urls as string[])[0]).pathname;
    const oldName = oldPath.split('/').pop()!;
    // No small copy yet: the original is served.
    assert.equal((await (await fetch(`${root}${oldPath}?w=480`)).arrayBuffer()).byteLength, 4004);

    const list = await fetch(`${root}/api/v1/admin/uploads/thumbless`, { headers: auth });
    const listed = ((await list.json()) as any).data.items as { name: string }[];
    assert.deepEqual(listed.map((i) => i.name), [oldName]);

    const thumb = new FormData();
    thumb.append('thumb', png(200), 't.png');
    const saved = await fetch(`${root}/api/v1/admin/uploads/thumbs/${oldName}`, { method: 'POST', headers: auth, body: thumb });
    assert.equal(saved.status, 200);
    const after = ((await (await fetch(`${root}/api/v1/admin/uploads/thumbless`, { headers: auth })).json()) as any).data.items;
    assert.equal(after.length, 0);
  } finally {
    server.close();
    await mongoose.disconnect();
    await db.stop();
  }
});
