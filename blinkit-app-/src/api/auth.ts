import { ApiEnvelope, AuthResult, User } from '../types';
import { api } from './client';

export async function loginRequest(identifier: string, password: string, firebaseIdToken?: string): Promise<AuthResult> {
  const { data } = await api.post<ApiEnvelope<AuthResult>>('/auth/login', { identifier, password, firebaseIdToken });
  return data.data;
}

export interface RegisterInput {
  name: string;
  phone: string;
  email?: string;
  password: string;
  /** Firebase ID token from the OTP step. */
  firebaseIdToken?: string;
}

export async function registerRequest(input: RegisterInput): Promise<AuthResult> {
  const { data } = await api.post<ApiEnvelope<AuthResult>>('/auth/register', input);
  return data.data;
}

export async function fetchMe(): Promise<User> {
  const { data } = await api.get<ApiEnvelope<User>>('/me');
  return data.data;
}

export async function logoutRequest(refreshToken: string | null): Promise<void> {
  await api.post('/auth/logout', refreshToken ? { refreshToken } : {});
}

/** Continue with Google / Facebook: the server checks the token with the provider and signs the customer in. */
export async function socialLoginRequest(provider: 'google' | 'facebook', accessToken: string): Promise<AuthResult> {
  const { data } = await api.post<ApiEnvelope<AuthResult>>(`/auth/${provider}`, { accessToken });
  return data.data;
}
