import { api } from './client';
import { ApiEnvelope } from '../types';

export interface RiderApplicationInput {
  fullName: string;
  mobile: string;
  email: string;
  otherPhone?: string;
  reason: string;
}

/**
 * Apply to become an Autozo rider. There is no self-serve rider account yet, so this
 * leaves the applicant's details with the team (same as the "Become a rider" form on
 * the website); a warehouse / the Autozo team then creates the rider's login.
 * Returns the confirmation message.
 */
export async function submitRiderApplication(input: RiderApplicationInput): Promise<string> {
  const { data } = await api.post<ApiEnvelope<{ message: string }>>('/enquiries', {
    kind: 'delivery_partner',
    fullName: input.fullName,
    mobile: input.mobile,
    email: input.email,
    otherPhone: input.otherPhone,
    reason: input.reason,
  });
  return data.data.message;
}
