import './env';
import assert from 'node:assert/strict';
import { test } from 'node:test';
import { WalletTxn } from '../src/models/WalletTxn';
import { isAdLive } from '../src/models/AdCampaign';
import { permissionForPath } from '../src/config/permissions';
import { adminHasPermission, permissionGate } from '../src/middleware/auth';
import { adCampaignBody, adminAdminBody, pageBody } from '../src/validators/schemas';

/* ---------- bug fix: rider payouts need these fields on the wallet schema ---------- */
test('WalletTxn schema persists the RazorpayX payout fields', () => {
  assert.ok(WalletTxn.schema.path('payoutId'), 'payoutId must be a real schema path, not just on the interface');
  assert.ok(WalletTxn.schema.path('payoutStatus'), 'payoutStatus must be a real schema path');
});

/* ---------- role-based access ---------- */
test('admin-API paths map to the right permission', () => {
  assert.equal(permissionForPath('/orders'), 'orders');
  assert.equal(permissionForPath('/orders/507f1f77bcf86cd799439011/refund'), 'orders');
  assert.equal(permissionForPath('/products'), 'products');
  assert.equal(permissionForPath('/stock-alerts'), 'products');
  assert.equal(permissionForPath('/standard-categories'), 'settings');
  assert.equal(permissionForPath('/categories'), 'categories');
  assert.equal(permissionForPath('/seller-withdrawals/1/pay'), 'payouts');
  assert.equal(permissionForPath('/withdrawals'), 'payouts');
  assert.equal(permissionForPath('/ads'), 'ads');
  assert.equal(permissionForPath('/pages/abc'), 'pages');
  // Dashboard / own profile / uploads are open to every admin.
  assert.equal(permissionForPath('/stats'), null);
  assert.equal(permissionForPath('/me'), null);
});

test('super admins pass every check; sub admins only their granted sections', () => {
  assert.equal(adminHasPermission({ isSuperAdmin: true, permissions: [] }, 'orders'), true);
  assert.equal(adminHasPermission({ isSuperAdmin: false, permissions: ['orders'] }, 'orders'), true);
  assert.equal(adminHasPermission({ isSuperAdmin: false, permissions: ['orders'] }, 'payouts'), false);
  assert.equal(adminHasPermission(undefined, 'orders'), false);
});

const runGate = (user: any, path: string) =>
  new Promise<any>((resolve) => permissionGate({ user, path } as any, {} as any, resolve));

test('the permission gate blocks sub admins outside their sections', async () => {
  // super admin: always through (next called with no error)
  assert.equal(await runGate({ role: 'admin', isSuperAdmin: true, permissions: [] }, '/orders'), undefined);
  // sub admin with the permission: through
  assert.equal(await runGate({ role: 'admin', isSuperAdmin: false, permissions: ['orders'] }, '/orders'), undefined);
  // sub admin without it: 403
  const blocked = await runGate({ role: 'admin', isSuperAdmin: false, permissions: ['products'] }, '/orders');
  assert.equal(blocked?.statusCode, 403);
  // open path (dashboard) is allowed even without any permission
  assert.equal(await runGate({ role: 'admin', isSuperAdmin: false, permissions: [] }, '/stats'), undefined);
});

/* ---------- ads scheduling ---------- */
test('an ad is live only when active and within its window', () => {
  const now = new Date('2026-10-26T12:00:00Z');
  assert.equal(isAdLive({ isActive: false, startAt: null, endAt: null }, now), false);
  assert.equal(isAdLive({ isActive: true, startAt: null, endAt: null }, now), true);
  assert.equal(isAdLive({ isActive: true, startAt: new Date('2026-10-27T00:00:00Z'), endAt: null }, now), false);
  assert.equal(isAdLive({ isActive: true, startAt: null, endAt: new Date('2026-10-25T00:00:00Z') }, now), false);
  assert.equal(isAdLive({ isActive: true, startAt: new Date('2026-10-01T00:00:00Z'), endAt: new Date('2026-11-01T00:00:00Z') }, now), true);
});

/* ---------- validators ---------- */
test('a content page needs a clean slug and well-formed blocks', () => {
  assert.equal(pageBody.safeParse({ slug: 'terms-and-conditions', title: 'Terms', blocks: [] }).success, true);
  assert.equal(pageBody.safeParse({ slug: 'Bad Slug', title: 'x', blocks: [] }).success, false);
  assert.equal(pageBody.safeParse({ slug: 'privacy', title: 'P', blocks: [{ type: 'text' }] }).success, false); // text block with no text
  assert.equal(pageBody.safeParse({ slug: 'privacy', title: 'P', blocks: [{ type: 'image', image: 'https://x/y.png' }] }).success, true);
});

test('an ad campaign needs a real http(s) target', () => {
  const okBody = { advertiser: 'Acme', title: 'Sale', image: 'https://cdn/x.png', targetUrl: 'https://acme.example', placement: 'home_mid' };
  assert.equal(adCampaignBody.safeParse(okBody).success, true);
  assert.equal(adCampaignBody.safeParse({ ...okBody, targetUrl: 'javascript:alert(1)' }).success, false);
});

test('a sub admin is created with a phone and keeps only known permissions', () => {
  const parsed = adminAdminBody.parse({ name: 'Desk One', phone: '9876543210', password: 'secret123', permissions: ['orders', 'products'] });
  assert.deepEqual(parsed.permissions, ['orders', 'products']);
  assert.equal(adminAdminBody.safeParse({ name: 'x', phone: '123', password: 'secret123' }).success, false);
});
