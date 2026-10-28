import { ApiEnvelope } from '../types';
import { api } from './client';

export interface ServiceCategory {
  _id: string;
  name: string;
  slug: string;
  description?: string;
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
  provider?: { _id: string; name: string } | string;
  availability?: { day: string; open: string; close: string }[];
}

export type BookingStatus =
  | 'requested' | 'accepted' | 'on_the_way' | 'in_progress' | 'completed' | 'cancelled' | 'rejected' | 'expired';

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
  provider?: { _id: string; name: string; phone?: string } | string;
  statusHistory?: { status: BookingStatus; at: string; by?: string; note?: string }[];
  rating?: number;
  createdAt: string;
}

export async function fetchServiceCategories(): Promise<ServiceCategory[]> {
  const { data } = await api.get<ApiEnvelope<ServiceCategory[]>>('/service-categories');
  return data.data;
}

export async function listServices(params: { category?: string; q?: string; page?: number; limit?: number }): Promise<ServiceListing[]> {
  const { data } = await api.get<ApiEnvelope<ServiceListing[]>>('/services', { params: { limit: 40, ...params } });
  return data.data;
}

export async function fetchService(idOrSlug: string): Promise<ServiceListing> {
  const { data } = await api.get<ApiEnvelope<ServiceListing>>(`/services/${idOrSlug}`);
  return data.data;
}

export interface BookingPayStart {
  requiresPayment: true;
  bookingId: string;
  razorpayOrderId: string;
  amount: number;
  keyId: string;
}

export async function createBooking(body: {
  serviceId: string;
  scheduledAt?: string;
  note?: string;
  paymentMethod: 'cod' | 'online';
  address: BookingAddress;
}): Promise<Booking | BookingPayStart> {
  const { data } = await api.post<ApiEnvelope<Booking | BookingPayStart>>('/bookings', body);
  return data.data;
}

export async function listBookings(status?: BookingStatus): Promise<Booking[]> {
  const { data } = await api.get<ApiEnvelope<Booking[]>>('/bookings', { params: { status, limit: 50 } });
  return data.data;
}

export async function fetchBooking(id: string): Promise<Booking> {
  const { data } = await api.get<ApiEnvelope<Booking>>(`/bookings/${id}`);
  return data.data;
}

export async function cancelBooking(id: string, reason?: string): Promise<void> {
  await api.post(`/bookings/${id}/cancel`, reason ? { reason } : {});
}

export const priceLabel = (price: number, unit: string): string =>
  `₹${price}${unit === 'hourly' ? '/hr' : unit === 'visit' ? '/visit' : ''}`;
