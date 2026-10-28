import { api } from '../lib/client';

/** A grouping shown on the Services page (e.g. "Car wash", "Plumbing"). */
export interface ServiceCategory {
  _id: string;
  name: string;
  slug: string;
  description?: string;
  icon?: string;
  image?: string;
}

export interface ServiceListing {
  _id: string;
  title: string;
  slug: string;
  description?: string;
  images: string[];
  price: number;
  mrp?: number;
  priceUnit: 'fixed' | 'hourly' | 'visit';
  durationMins: number;
  rating: number;
  ratingCount: number;
  bookingCount: number;
  city?: string;
  category?: { _id: string; name: string; slug: string } | string;
  provider?: { _id: string; name: string; providerId?: string } | string;
  availability?: { day: string; open: string; close: string }[];
}

export type BookingStatus =
  | 'requested' | 'accepted' | 'on_the_way' | 'in_progress' | 'completed' | 'cancelled' | 'rejected' | 'expired';

export interface Booking {
  _id: string;
  bookingNumber: string;
  status: BookingStatus;
  price: number;
  paymentMethod: 'cod' | 'online';
  paymentStatus: string;
  scheduledAt?: string;
  completionOtp?: string;
  note?: string;
  snapshot: { title: string; image?: string; price: number; priceUnit: string; durationMins: number };
  address: BookingAddress;
  provider?: { _id: string; name: string; phone?: string; providerId?: string } | string;
  service?: { _id: string; title: string } | string;
  statusHistory?: { status: BookingStatus; at: string; by?: string; note?: string }[];
  rating?: number;
  createdAt: string;
}

export interface BookingAddress {
  name: string;
  phone: string;
  line1: string;
  line2?: string;
  landmark?: string;
  city: string;
  state: string;
  pincode: string;
  location?: { lat: number; lng: number };
}

export interface PageMeta {
  page: number;
  limit: number;
  total: number;
  totalPages: number;
  hasNext: boolean;
}

export const fetchServiceCategories = async (): Promise<ServiceCategory[]> => {
  const { data } = await api.get('/service-categories');
  return data.data as ServiceCategory[];
};

export interface ListServicesParams {
  category?: string;
  q?: string;
  lat?: number;
  lng?: number;
  maxKm?: number;
  page?: number;
  limit?: number;
}

export const listServices = async (params: ListServicesParams): Promise<{ items: ServiceListing[]; meta: PageMeta }> => {
  const { data } = await api.get('/services', { params });
  return { items: data.data as ServiceListing[], meta: data.meta as PageMeta };
};

export const fetchService = async (idOrSlug: string): Promise<ServiceListing> => {
  const { data } = await api.get(`/services/${idOrSlug}`);
  return data.data as ServiceListing;
};

export interface CreateBookingBody {
  serviceId: string;
  scheduledAt?: string;
  note?: string;
  paymentMethod: 'cod' | 'online';
  address: BookingAddress;
}

/** A started online payment for a booking (customer must pay before providers are rung). */
export interface BookingPayStart {
  requiresPayment: true;
  bookingId: string;
  razorpayOrderId: string;
  amount: number;
  keyId: string;
}

export const createBooking = async (body: CreateBookingBody): Promise<Booking | BookingPayStart> => {
  const { data } = await api.post('/bookings', body);
  return data.data as Booking | BookingPayStart;
};

export const confirmBookingPayment = async (p: { razorpay_order_id: string; razorpay_payment_id: string; razorpay_signature: string }): Promise<Booking> => {
  const { data } = await api.post('/bookings/online/confirm', p);
  return data.data as Booking;
};

export const listMyBookings = async (status?: BookingStatus): Promise<{ items: Booking[]; meta: PageMeta }> => {
  const { data } = await api.get('/bookings', { params: { status, limit: 50 } });
  return { items: data.data as Booking[], meta: data.meta as PageMeta };
};

export const fetchBooking = async (id: string): Promise<Booking> => {
  const { data } = await api.get(`/bookings/${id}`);
  return data.data as Booking;
};

export const cancelBooking = async (id: string, reason?: string): Promise<void> => {
  await api.post(`/bookings/${id}/cancel`, { reason });
};

export const rateBooking = async (id: string, rating: number, comment?: string): Promise<void> => {
  await api.post(`/bookings/${id}/rate`, { rating, comment });
};

export interface ProviderRegistration {
  name: string;
  phone: string;
  email?: string;
  password: string;
  firm: string;
  category?: string;
  line1: string;
  city: string;
  state: string;
  pincode: string;
  location: { lat: number; lng: number };
  about?: string;
}

/** A service provider registering itself; it can log in to its panel once the admin approves. */
export const registerProvider = async (body: ProviderRegistration): Promise<string> => {
  const { data } = await api.post('/provider/register', body);
  return (data.data as { message: string }).message;
};

/** Pretty label for a price + unit, e.g. "₹499 / visit". */
export const priceLabel = (price: number, unit: string): string => {
  const suffix = unit === 'hourly' ? ' / hr' : unit === 'visit' ? ' / visit' : '';
  return `₹${price}${suffix}`;
};
