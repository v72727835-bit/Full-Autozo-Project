import './env';
import assert from 'node:assert/strict';
import { afterEach, mock, test } from 'node:test';
import { Types } from 'mongoose';
import { deliverOrder } from '../src/controllers/rider.controller';
import { deleteUserAdmin } from '../src/controllers/admin.controller';
import { Order } from '../src/models/Order';
import { User } from '../src/models/User';
import { DeviceToken } from '../src/models/DeviceToken';
import { adminShopBody, adminShopUpdateBody, riderDeliveryBody } from '../src/validators/schemas';

afterEach(() => mock.restoreAll());
const invoke = (handler: any, body = {}) => new Promise<any>((resolve) => {
  handler({ body, params: { id: '507f1f77bcf86cd799439011' }, user: { id: '507f1f77bcf86cd799439012' } }, {
    status() { return this; }, json(value: unknown) { resolve(value); },
  }, resolve);
});

test('warehouse create and edit allow radii above 100 km and reject invalid numbers', () => {
  for (const radius of [101, 250, 1000, 25000]) {
    assert.equal(adminShopBody.parse({ name: 'Warehouse', deliveryRadiusKm: radius }).deliveryRadiusKm, radius);
    assert.equal(adminShopUpdateBody.parse({ deliveryRadiusKm: radius }).deliveryRadiusKm, radius);
  }
  for (const radius of [0, -1, NaN, Infinity]) assert.equal(adminShopUpdateBody.safeParse({ deliveryRadiusKm: radius }).success, false);
});

test('OTP validation trims whitespace, preserves leading zeroes, rejects malformed codes', () => {
  assert.equal(riderDeliveryBody.parse({ otp: ' 0123 ' }).otp, '0123');
  for (const otp of ['', '123', '12345', '12a4', '12 34', 1234]) assert.equal(riderDeliveryBody.safeParse({ otp }).success, false);
});

test('matching delivery OTP proceeds to save the delivery, including legacy whitespace', async () => {
  for (const stored of ['0123', ' 0123 ']) {
    const saved = new Error('save reached');
    const order = { deliveryOtp: stored, status: 'out_for_delivery', statusHistory: [], save: async () => { throw saved; } };
    mock.method(Order, 'findOne', async (filter: any) => {
      assert.equal(filter.rider, '507f1f77bcf86cd799439012');
      assert.equal(filter.status, 'out_for_delivery');
      return order;
    });
    assert.equal(await invoke(deliverOrder, { otp: ' 0123 ' }), saved);
    assert.equal(order.status, 'delivered');
    mock.restoreAll();
  }
});

test('wrong or missing OTP never saves the order and identifies the order', async () => {
  for (const stored of ['1234', undefined]) {
    const save = mock.fn();
    mock.method(Order, 'findOne', async () => ({ deliveryOtp: stored, orderNumber: 'BG-TEST', save }));
    const error = await invoke(deliverOrder, { otp: '9999' });
    assert.match(error.message, /Incorrect delivery OTP for order BG-TEST/);
    assert.equal(save.mock.callCount(), 0);
    mock.restoreAll();
  }
});

test('an order not assigned to the rider cannot be delivered', async () => {
  mock.method(Order, 'findOne', async () => null);
  assert.match((await invoke(deliverOrder, { otp: '1234' })).message, /Active delivery not found/);
});

function rider() {
  mock.method(User, 'findById', () => ({ select: async () => ({ _id: new Types.ObjectId('507f1f77bcf86cd799439011'), role: 'rider', name: 'Rider' }) }) as any);
}
test('deleting a rider with an active delivery is blocked', async () => {
  rider();
  mock.method(Order, 'exists', async () => ({ _id: 'active' }) as any);
  const update = mock.method(User, 'updateOne', async () => ({}) as any);
  assert.match((await invoke(deleteUserAdmin)).message, /active deliveries/);
  assert.equal(update.mock.callCount(), 0);
});

test('deleting a rider holding COD cash is blocked', async () => {
  rider();
  mock.method(Order, 'exists', async () => null);
  mock.method(Order, 'aggregate', async () => [{ _id: '507f1f77bcf86cd799439011', pending: 100 }]);
  assert.match((await invoke(deleteUserAdmin)).message, /pending COD/);
});

test('deleting an eligible rider disables login while preserving order and wallet references', async () => {
  rider();
  mock.method(Order, 'exists', async () => null);
  mock.method(Order, 'aggregate', async () => []);
  const update = mock.method(User, 'updateOne', async (_filter: any, body: any) => {
    assert.equal(body.$set.isActive, false);
    assert.ok(body.$set.deletedAt instanceof Date);
    assert.deepEqual(body.$set.refreshTokens, []);
    return {} as any;
  });
  mock.method(DeviceToken, 'deleteMany', async () => ({}) as any);
  const remove = mock.method(User, 'deleteOne', async () => ({}) as any);
  await invoke(deleteUserAdmin);
  assert.equal(update.mock.callCount(), 1);
  assert.equal(remove.mock.callCount(), 0);
});
