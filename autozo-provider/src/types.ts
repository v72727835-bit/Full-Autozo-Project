export interface ApiEnvelope<T> { success?: boolean; data: T; meta?: PageMeta }
export interface PageMeta { page: number; limit: number; total: number; totalPages: number; hasNext: boolean }

export interface ProviderUser {
  _id: string;
  name: string;
  phone: string;
  email?: string;
  role: string;
  providerId?: string;
  providerStatus?: 'pending' | 'approved' | 'rejected';
  providerBusy?: boolean;
  /** How far from their base the provider serves, in km (1-100). */
  providerRadiusKm?: number;
  providerApplication?: { firm: string; category?: string; city?: string; state?: string };
}
export interface AuthResult { user: ProviderUser; accessToken: string; refreshToken: string }
/** `/provider/me` returns the provider user directly. */
export type Me = ProviderUser;

export interface ProviderDashboard {
  totalServices: number;
  activeServices: number;
  bookings: number;
  bookingsByStatus: Record<string, number>;
  todaysBookings: number;
  earnings: number;
  /** Commission owed on cash bookings; when blocked no new bookings ring. */
  due?: number;
  blockedByDues?: boolean;
}

export type PayoutAccount = { upi?: string; bankHolder?: string; bankNumber?: string; bankIfsc?: string };
export interface ProviderWallet {
  balance: number;
  onlineEarned: number;
  commissionTotal: number;
  due: number;
  duePending: number;
  pendingWithdraw: number;
  paidOut: number;
  cashCollected: number;
  cashBookings: number;
  commissionPct: number;
  planCommissionPct: number;
  hasPlan: boolean;
  minWithdraw: number;
  dueLimit: number;
  blocked: boolean;
  account: PayoutAccount | null;
}
export interface ProviderTxn {
  _id: string;
  kind: 'earning' | 'commission' | 'commission_paid' | 'withdrawal' | 'adjustment';
  amount: number;
  status: 'completed' | 'pending' | 'paid' | 'rejected' | 'confirmed';
  bookingNumber?: string;
  gross?: number;
  commission?: number;
  method?: 'upi' | 'bank' | 'cash' | 'wallet';
  reference?: string;
  note?: string;
  createdAt: string;
}

export interface ServiceCategory { _id: string; name: string; slug: string }

export interface Availability { day: string; open: string; close: string }

export interface ServiceRow {
  _id: string;
  title: string;
  slug: string;
  description?: string;
  images: string[];
  video?: string;
  price: number;
  mrp?: number;
  priceUnit: 'fixed' | 'hourly' | 'visit';
  durationMins: number;
  serviceRadiusKm: number;
  availability: Availability[];
  isActive: boolean;
  rating: number;
  ratingCount: number;
  bookingCount: number;
  category: ServiceCategory | string;
}

export type BookingStatus =
  | 'requested' | 'accepted' | 'on_the_way' | 'in_progress' | 'completed' | 'cancelled' | 'rejected' | 'expired';

export interface BookingAddress {
  name: string; phone: string; line1: string; line2?: string; landmark?: string;
  city: string; state: string; pincode: string; location?: { lat: number; lng: number };
}

export interface BookingRow {
  _id: string;
  bookingNumber: string;
  status: BookingStatus;
  price: number;
  paymentMethod: string;
  paymentStatus: string;
  scheduledAt?: string;
  note?: string;
  completionOtp?: string;
  snapshot: { title: string; image?: string; price: number; priceUnit: string; durationMins: number };
  address: BookingAddress;
  customer?: { _id: string; name: string; phone?: string } | string;
  service?: { _id: string; title: string } | string;
  statusHistory?: { status: BookingStatus; at: string; by?: string; note?: string }[];
  createdAt: string;
}

export interface RingItem {
  dispatchId: string;
  kind: string;
  bookingId?: string;
  orderId?: string;
  since: string;
}
