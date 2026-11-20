import { api } from './client';
import { ApiEnvelope, AuthResult, BookingRow, Me, PageMeta, PayoutAccount, ProviderDashboard, ProviderTxn, ProviderWallet, RingItem, ServiceCategory, ServiceRow } from '../types';

export interface Paged<T> { items: T[]; meta: PageMeta }
async function paged<T>(url: string, params?: Record<string, unknown>): Promise<Paged<T>> {
  const { data } = await api.get<ApiEnvelope<T[]>>(url, { params });
  return { items: data.data, meta: data.meta as PageMeta };
}

/* ---------- auth ---------- */
export async function providerLogin(identifier: string, password: string): Promise<AuthResult> {
  const { data } = await api.post<ApiEnvelope<AuthResult>>('/provider/auth/login', { identifier, password });
  return data.data;
}

export interface ProviderRegisterInput {
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

/** Register a new service provider. The Autozo team approves it before the provider can sign in. Returns the confirmation message. */
export async function registerProvider(input: ProviderRegisterInput): Promise<string> {
  const { data } = await api.post<ApiEnvelope<{ message: string }>>('/provider/register', input);
  return data.data.message;
}
export async function logoutRequest(refreshToken: string | null): Promise<void> {
  await api.post('/auth/logout', refreshToken ? { refreshToken } : {});
}
export const providerMe = async (): Promise<Me> => (await api.get('/provider/me')).data.data;
export const providerDashboard = async (): Promise<ProviderDashboard> => (await api.get('/provider/dashboard')).data.data;
/** One radius (km from the provider's own base) for every service they offer. */
export const setServiceRadius = async (serviceRadiusKm: number): Promise<{ serviceRadiusKm: number; services: number }> =>
  (await api.patch('/provider/service-radius', { serviceRadiusKm })).data.data;
export const setAvailability = async (available: boolean): Promise<void> => { await api.post('/provider/availability', { available }); };

/* ---------- services ---------- */
export const serviceCategories = async (): Promise<ServiceCategory[]> => (await api.get('/service-categories')).data.data;
export const providerServices = async (): Promise<ServiceRow[]> => (await api.get('/provider/services')).data.data;
export const createService = async (body: Record<string, unknown>): Promise<ServiceRow> => (await api.post('/provider/services', body)).data.data;
export const updateService = async (id: string, body: Record<string, unknown>): Promise<ServiceRow> => (await api.patch(`/provider/services/${id}`, body)).data.data;
export const deleteService = async (id: string): Promise<void> => { await api.delete(`/provider/services/${id}`); };

/* ---------- bookings ---------- */
export const providerBookings = (p: { page?: number; limit?: number; status?: string }) => paged<BookingRow>('/provider/bookings', p);
export const providerBooking = async (id: string): Promise<BookingRow> => (await api.get(`/provider/bookings/${id}`)).data.data;
export const setBookingStatus = async (id: string, status: string, otp?: string, distanceKm?: number): Promise<void> => { await api.patch(`/provider/bookings/${id}/status`, { status, otp, distanceKm }); };
export const cancelBooking = async (id: string, reason?: string): Promise<void> => { await api.post(`/provider/bookings/${id}/cancel`, reason ? { reason } : {}); };

/* ---------- wallet ---------- */
export const fetchWallet = async (): Promise<ProviderWallet> => (await api.get('/provider/wallet')).data.data;
export const walletTxns = (p: { page?: number; limit?: number }) => paged<ProviderTxn>('/provider/wallet/txns', p);
export const saveWalletAccount = async (body: PayoutAccount): Promise<void> => { await api.post('/provider/wallet/account', body); };
export const requestWithdraw = async (amount: number, method: 'upi' | 'bank'): Promise<void> => { await api.post('/provider/wallet/withdraw', { amount, method }); };
export const payDues = async (body: { method: 'wallet' | 'cash' | 'upi'; reference?: string }): Promise<void> => { await api.post('/provider/wallet/pay-dues', body); };

/* ---------- ring ---------- */
export const providerRing = async (): Promise<RingItem[]> => (await api.get('/provider/ring')).data.data;
export const acceptRing = async (dispatchId: string): Promise<BookingRow> => (await api.post(`/provider/ring/${dispatchId}/accept`)).data.data;
export const declineRing = async (dispatchId: string): Promise<void> => { await api.post(`/provider/ring/${dispatchId}/decline`); };

/* ---------- photos & video for services ---------- */
export async function uploadImages(files: { uri: string; name: string; type: string }[]): Promise<string[]> {
  const form = new FormData();
  files.forEach((f) => form.append('images', f as unknown as Blob));
  const { data } = await api.post('/provider/uploads/images', form, { headers: { 'Content-Type': 'multipart/form-data' }, timeout: 60000 });
  return data.data.urls;
}
export async function uploadVideo(file: { uri: string; name: string; type: string }): Promise<string> {
  const form = new FormData();
  form.append('video', file as unknown as Blob);
  const { data } = await api.post('/provider/uploads/video', form, { headers: { 'Content-Type': 'multipart/form-data' }, timeout: 120000 });
  return (data.data?.url ?? data.data) as string;
}

/* ---------- my plan ---------- */
export interface MyPlan {
  required: boolean;
  active: boolean;
  until: string | null;
  daysLeft: number;
  plans: { _id: string; name: string; price: number; days: number; description?: string }[];
  canPayOnline: boolean;
}
export const fetchMyPlan = async (): Promise<MyPlan> => (await api.get('/subscription')).data.data;
export const startPlanPayment = async (planId: string): Promise<{ razorpayOrderId: string; amount: number; keyId: string; planName: string }> =>
  (await api.post('/subscription/pay', { planId })).data.data;

export const syncPlanPayments = async (): Promise<void> => { await api.post('/subscription/sync'); };
/** Pay the cash owed to the office online; returns the prepared Razorpay order (paise) for the in-app payment window. */
export const payDuesOnline = async (amount?: number): Promise<{ razorpayOrderId: string; keyId: string; amount: number; rupees: number }> => (await api.post('/dues/pay', amount ? { amount } : {})).data.data;
export const syncDuesPayments = async (): Promise<void> => { await api.post('/dues/sync'); };
