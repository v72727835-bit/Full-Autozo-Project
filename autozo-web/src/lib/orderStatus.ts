import { OrderStatus } from './types';

export const STATUS_LABEL: Record<OrderStatus, string> = {
  placed: 'Order received',
  confirmed: 'Confirmed by the shop',
  preparing: 'Being packed',
  out_for_delivery: 'Out for delivery',
  delivered: 'Delivered',
  cancelled: 'Cancelled',
  rejected: 'Rejected by the shop',
};

/** Shown under whichever step the order is sitting on right now. */
export const STATUS_BLURB: Record<OrderStatus, string> = {
  placed: 'The shop has been notified and will confirm shortly.',
  confirmed: 'The shop has accepted your order.',
  preparing: 'Your items are being packed right now.',
  out_for_delivery: 'Your rider is on the way — keep your OTP handy.',
  delivered: 'Thank you for shopping with us. Reorder any time in one tap.',
  cancelled: 'This order was cancelled.',
  rejected: 'The shop was unable to fulfil this order.',
};

export const STATUS_TONE: Record<OrderStatus, 'brand' | 'ok' | 'warn' | 'bad' | 'muted'> = {
  placed: 'brand',
  confirmed: 'brand',
  preparing: 'warn',
  out_for_delivery: 'warn',
  delivered: 'ok',
  cancelled: 'bad',
  rejected: 'bad',
};

export const FLOW: OrderStatus[] = ['placed', 'confirmed', 'preparing', 'out_for_delivery', 'delivered'];

export const isFinal = (s: OrderStatus) => s === 'delivered' || s === 'cancelled' || s === 'rejected';
