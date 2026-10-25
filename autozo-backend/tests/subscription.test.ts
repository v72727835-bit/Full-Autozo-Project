import './env';
import assert from 'node:assert/strict';
import { afterEach, beforeEach, mock, test } from 'node:test';
import { Types } from 'mongoose';
import { acceptOrder, listOrders } from '../src/controllers/rider.controller';
import { Order } from '../src/models/Order';
import { Settings } from '../src/models/Settings';
import { User } from '../src/models/User';
import { freeRidersForOrder } from '../src/services/orderFlow.service';
import { clearSettingsCache } from '../src/services/settings.service';
import { planActive, requirePlan } from '../src/services/subscription.service';
import { planBody, planUpdateBody } from '../src/validators/schemas';

// Every test here runs with rider and warehouse plans switched on.
beforeEach(() => {
  clearSettingsCache();
  mock.method(Settings, 'findOne', () => ({ lean: async () => ({ key: 'global', subscriptions: { rider: true, seller: true } }) }));
});
afterEach(() => mock.restoreAll());

const DAY = 24 * 60 * 60 * 1000;
const riderId = '507f1f77bcf86cd799439012';
const run = (handler: any, req: any) => new Promise<any>((resolve) => {
  handler({ query: {}, params: {}, body: {}, user: { id: riderId, role: 'rider' }, ...req }, { status() { return this; }, json: resolve }, resolve);
});

test('a plan is active only until its end moment', () => {
  const now = new Date('2026-10-25T12:00:00Z');
  assert.equal(planActive(null, now), false);
  assert.equal(planActive(undefined, now), false);
  assert.equal(planActive(new Date(now.getTime() - 1), now), false);
  assert.equal(planActive(now, now), false);
  assert.equal(planActive(new Date(now.getTime() + DAY), now), true);
});

test('plan prices must be above zero and durations are whole days', () => {
  assert.equal(planBody.parse({ audience: 'rider', name: 'Monthly', price: '199', days: '30' }).price, 199);
  assert.equal(planBody.safeParse({ audience: 'rider', name: 'Free', price: 0, days: 30 }).success, false);
  assert.equal(planBody.safeParse({ audience: 'seller', name: 'Half', price: 99, days: 1.5 }).success, false);
  assert.equal(planBody.safeParse({ audience: 'customer', name: 'Nope', price: 99, days: 30 }).success, false);
  // A plan's audience cannot be changed once it exists.
  assert.equal('audience' in planUpdateBody.parse({ audience: 'seller', price: 10 }), false);
});

test('a warehouse without a running plan is stopped with a clear 402', async () => {
  mock.method(User, 'findById', () => ({ select: () => ({ lean: async () => ({ subscriptionUntil: new Date(Date.now() - DAY) }) }) }));
  const err = await run(requirePlan('seller'), { user: { id: riderId, role: 'seller' } });
  assert.equal(err.statusCode, 402);
  assert.equal(err.details.code, 'subscription_required');
});

test('a warehouse with a running plan goes through', async () => {
  mock.method(User, 'findById', () => ({ select: () => ({ lean: async () => ({ subscriptionUntil: new Date(Date.now() + DAY) }) }) }));
  assert.equal(await run(requirePlan('seller'), { user: { id: riderId, role: 'seller' } }), undefined);
});

test('everyone goes through while plans are switched off', async () => {
  clearSettingsCache();
  mock.restoreAll();
  mock.method(Settings, 'findOne', () => ({ lean: async () => ({ key: 'global' }) }));
  const lookup = mock.method(User, 'findById', () => ({ select: () => ({ lean: async () => ({}) }) }));
  assert.equal(await run(requirePlan('rider'), {}), undefined);
  assert.equal(lookup.mock.callCount(), 0);
});

test('a rider without a plan sees only their own delivery, not new pickups', async () => {
  const warehouse = new Types.ObjectId();
  mock.method(User, 'findById', () => ({ select: () => ({ lean: async () => ({ warehouses: [warehouse], subscriptionUntil: null }) }) }));
  const filters: any[] = [];
  mock.method(Order, 'find', (filter: any) => {
    filters.push(filter);
    const q: any = { sort: () => q, skip: () => q, limit: () => q, select: () => q, populate: () => q, lean: async () => [] };
    return q;
  });
  mock.method(Order, 'countDocuments', async () => 0);
  await run(listOrders, { query: { page: 1, limit: 20 } });
  assert.equal(filters.some((f) => f.$or), false);
  assert.ok(filters.some((f) => f.status === 'out_for_delivery' && f.rider === riderId));
});

test('a rider without a plan cannot accept an order', async () => {
  mock.method(User, 'findById', () => ({ select: () => ({ lean: async () => ({ warehouses: [new Types.ObjectId()], subscriptionUntil: new Date(Date.now() - 1000) }) }) }));
  const update = mock.method(Order, 'findOneAndUpdate', async () => null);
  const err = await run(acceptOrder, { params: { id: '507f1f77bcf86cd799439011' } });
  assert.equal(err.statusCode, 402);
  assert.equal(update.mock.callCount(), 0);
});

test('only riders with a running plan can be assigned an order', async () => {
  mock.method(Order, 'findById', () => ({ select: () => ({ lean: async () => ({ shop: new Types.ObjectId() }) }) }));
  mock.method(Order, 'distinct', async () => []);
  let filter: any;
  mock.method(User, 'find', (f: any) => { filter = f; const q: any = { select: () => q, sort: () => q, lean: async () => [] }; return q; });
  await freeRidersForOrder(String(new Types.ObjectId()));
  assert.ok(filter.subscriptionUntil.$gt instanceof Date);
});
