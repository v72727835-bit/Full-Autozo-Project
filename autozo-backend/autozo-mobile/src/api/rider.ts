import { ApiEnvelope, RiderOrder, RiderProfile } from '../types';
import { api } from './client';

export async function fetchRiderOrders(status?: 'ready_for_pickup' | 'out_for_delivery' | 'delivered'): Promise<RiderOrder[]> {
  const { data } = await api.get<ApiEnvelope<RiderOrder[]>>('/rider/orders', { params: { page: 1, limit: 50, status } });
  return data.data;
}

/** Cash in hand, delivered and cancelled counts, and the bell messages. */
export async function fetchRiderProfile(): Promise<RiderProfile> {
  const { data } = await api.get<ApiEnvelope<RiderProfile>>('/rider/me');
  return data.data;
}

export async function acceptRiderOrder(id: string): Promise<RiderOrder> {
  const { data } = await api.post<ApiEnvelope<RiderOrder>>(`/rider/orders/${id}/accept`);
  return data.data;
}

/** Live position while carrying a parcel, so the customer can follow the delivery. */
export async function sendRiderLocation(lat: number, lng: number): Promise<void> {
  await api.post('/rider/location', { lat, lng });
}

export async function deliverRiderOrder(id: string, otp: string): Promise<RiderOrder> {
  const { data } = await api.post<ApiEnvelope<RiderOrder>>(`/rider/orders/${id}/deliver`, { otp });
  return data.data;
}

/** Hands an accepted order back to the pickup pool. Counted against the rider. */
export async function cancelRiderOrder(id: string, reason?: string): Promise<RiderOrder> {
  const { data } = await api.post<ApiEnvelope<RiderOrder>>(
    `/rider/orders/${id}/cancel`,
    reason ? { reason } : {},
  );
  return data.data;
}
