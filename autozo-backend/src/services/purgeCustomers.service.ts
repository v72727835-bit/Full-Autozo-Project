import { Types } from 'mongoose';
import { AdminAlert } from '../models/AdminAlert';
import { Cart } from '../models/Cart';
import { DeviceToken } from '../models/DeviceToken';
import { Dispatch } from '../models/Dispatch';
import { Order } from '../models/Order';
import { PaymentIntent } from '../models/PaymentIntent';
import { Product } from '../models/Product';
import { Review } from '../models/Review';
import { Service } from '../models/Service';
import { ServiceBooking } from '../models/ServiceBooking';
import { StockAlert } from '../models/StockAlert';
import { Ticket } from '../models/Ticket';
import { User } from '../models/User';
import { round2 } from '../utils/helpers';

export interface PurgeCounts {
  customers: number;
  bookings: number;
  orders: number;
  carts: number;
  reviews: number;
  tickets: number;
  devices: number;
  payments: number;
  stockAlerts: number;
  alerts: number;
  dispatches: number;
}

const ACTIVE_BOOKING = ['requested', 'accepted', 'on_the_way', 'in_progress'];

/**
 * Everything that belongs to customers (role 'customer': the people who book services and order).
 * Providers, riders, sellers, warehouses, admins and their own records (provider earnings, seller
 * ledgers, rider wallets) are never touched.
 */
export async function purgeCustomers(dryRun: boolean): Promise<PurgeCounts> {
  const ids = (await User.find({ role: 'customer' }).select('_id').lean()).map((u) => u._id as Types.ObjectId);
  const of = { $in: ids };
  const [bookingIds, orderIds] = await Promise.all([
    ServiceBooking.find({ customer: of }).distinct('_id'),
    Order.find({ user: of }).distinct('_id'),
  ]);
  const dispatchFilter = { $or: [{ booking: { $in: bookingIds } }, { order: { $in: orderIds } }] };

  if (dryRun) {
    const [carts, reviews, tickets, devices, payments, stockAlerts, alerts, dispatches] = await Promise.all([
      Cart.countDocuments({ user: of }), Review.countDocuments({ user: of }), Ticket.countDocuments({ user: of }),
      DeviceToken.countDocuments({ user: of }), PaymentIntent.countDocuments({ user: of }), StockAlert.countDocuments({ user: of }),
      AdminAlert.countDocuments({ user: of }), Dispatch.countDocuments(dispatchFilter),
    ]);
    return { customers: ids.length, bookings: bookingIds.length, orders: orderIds.length, carts, reviews, tickets, devices, payments, stockAlerts, alerts, dispatches };
  }

  // What needs fixing up afterwards: providers on a live job, and ratings these customers gave.
  const [busyProviders, ratedProducts, ratedServices] = await Promise.all([
    ServiceBooking.find({ customer: of, status: { $in: ACTIVE_BOOKING } }).distinct('provider'),
    Review.find({ user: of }).distinct('product'),
    ServiceBooking.find({ customer: of }).distinct('service'),
  ]);

  const [d, b, o, carts, reviews, tickets, devices, payments, stockAlerts, alerts] = await Promise.all([
    Dispatch.deleteMany(dispatchFilter),
    ServiceBooking.deleteMany({ customer: of }),
    Order.deleteMany({ user: of }),
    Cart.deleteMany({ user: of }),
    Review.deleteMany({ user: of }),
    Ticket.deleteMany({ user: of }),
    DeviceToken.deleteMany({ user: of }),
    PaymentIntent.deleteMany({ user: of }),
    StockAlert.deleteMany({ user: of }),
    AdminAlert.deleteMany({ user: of }),
  ]);
  const users = await User.deleteMany({ _id: of, role: 'customer' });

  if (busyProviders.length) await User.updateMany({ _id: { $in: busyProviders } }, { $set: { providerBusy: false } });

  // Ratings now come only from what is left.
  for (const productId of ratedProducts) {
    const [agg] = await Review.aggregate<{ avg: number; count: number }>([
      { $match: { product: productId } },
      { $group: { _id: null, avg: { $avg: '$rating' }, count: { $sum: 1 } } },
    ]);
    await Product.updateOne({ _id: productId }, { $set: { rating: agg ? round2(agg.avg) : 0, ratingCount: agg?.count ?? 0 } });
  }
  for (const serviceId of ratedServices) {
    const [agg] = await ServiceBooking.aggregate<{ avg: number; count: number }>([
      { $match: { service: serviceId, rating: { $gte: 1 } } },
      { $group: { _id: null, avg: { $avg: '$rating' }, count: { $sum: 1 } } },
    ]);
    await Service.updateOne({ _id: serviceId }, { $set: { rating: agg ? round2(agg.avg) : 0, ratingCount: agg?.count ?? 0 } });
  }

  return {
    customers: users.deletedCount, bookings: b.deletedCount, orders: o.deletedCount, carts: carts.deletedCount,
    reviews: reviews.deletedCount, tickets: tickets.deletedCount, devices: devices.deletedCount, payments: payments.deletedCount,
    stockAlerts: stockAlerts.deletedCount, alerts: alerts.deletedCount, dispatches: d.deletedCount,
  };
}
