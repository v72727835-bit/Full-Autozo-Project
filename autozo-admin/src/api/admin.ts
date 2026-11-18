import { api } from './client';
import { CompressOptions, prepareImage, runLimited } from '../lib/imageCompress';
import { WarehouseApplication, StandardCategory, Enquiry, SellerRow, SellerStats, SellerProfile, AdminAlert, AdminUser, AppUser, Banner, Category, Notice, RiderRow, RiderTotals, Settings, StockAlert, Ticket, Coupon, DashboardStats, Order, OrderStatus, PageMeta, Product, Shop, AdCampaign, AdPlacement, ContentPage, ContentPageSummary, PermissionDef, TeamMember, ProviderApplication, ServiceCategoryRow, ServiceRow, ServiceBookingRow, RingItem } from '../types';

interface Paged<T> {
  items: T[];
  meta: PageMeta;
}

async function paged<T>(url: string, params?: Record<string, unknown>): Promise<Paged<T>> {
  const { data } = await api.get(url, { params });
  return { items: data.data, meta: data.meta };
}

/* ---------- dashboard ---------- */
export const fetchStats = async (days = 14): Promise<DashboardStats> =>
  (await api.get('/admin/stats', { params: { days } })).data.data;

/* ---------- products ---------- */
export const fetchProducts = (params: {
  page?: number;
  limit?: number;
  q?: string;
  category?: string;
  shop?: string;
  isActive?: boolean;
}) => paged<Product>('/admin/products', params);

export const bulkCreateProducts = async (rows: Record<string, string>[], dryRun: boolean): Promise<import('../components/BulkUpload').BulkResponse> =>
  (await api.post('/admin/products/bulk', { rows, dryRun })).data.data;
export const createProduct = async (body: Partial<Product> & { shop: string; category: string }): Promise<Product> =>
  (await api.post('/admin/products', body)).data.data;

export const updateProductGroup = async (ids: string[], patch: Partial<Product>): Promise<void> => {
  await api.patch('/admin/products/group', { ids, patch });
};

export const deleteProductGroup = async (ids: string[]): Promise<void> => {
  await api.delete('/admin/products/group', { data: { ids } });
};

export const updateProduct = async (id: string, body: Partial<Product>): Promise<Product> =>
  (await api.patch(`/admin/products/${id}`, body)).data.data;

export const deleteProduct = async (id: string): Promise<void> => {
  await api.delete(`/admin/products/${id}`);
};

export interface UploadOptions extends CompressOptions {
  /** 0..1 across every file: shrinking first, then sending. */
  onProgress?: (fraction: number) => void;
}

/**
 * Shrinks each photo in the browser, then sends up to three at once, one
 * request each, so a slow photo never holds up the rest and the bar moves
 * smoothly. URLs come back in the order the files were given.
 */
async function sendImages(path: string, files: File[], opts: UploadOptions = {}): Promise<string[]> {
  const share = files.map(() => 0);
  const report = () => opts.onProgress?.(share.reduce((a, b) => a + b, 0) / Math.max(files.length, 1));
  report();
  return runLimited(files, 3, async (original, i) => {
    const { file, thumb } = await prepareImage(original, opts);
    share[i] = 0.15;
    report();
    const body = new FormData();
    body.append('images', file);
    if (thumb) body.append('thumbs', thumb);
    const { data } = await api.post(path, body, {
      timeout: 120000,
      onUploadProgress: (e) => {
        share[i] = 0.15 + 0.85 * (e.total ? e.loaded / e.total : 0);
        report();
      },
    });
    share[i] = 1;
    report();
    return (data.data.urls as string[])[0];
  });
}

/** Sends a video with progress (videos are not re-encoded in the browser). */
async function sendVideo(path: string, file: File, onProgress?: (fraction: number) => void): Promise<string> {
  const body = new FormData();
  body.append('video', file);
  const { data } = await api.post(path, body, {
    timeout: 600000,
    onUploadProgress: (e) => onProgress?.(e.total ? e.loaded / e.total : 0),
  });
  return data.data.url;
}

export const uploadImages = (files: File[], opts?: UploadOptions): Promise<string[]> => sendImages('/admin/uploads/images', files, opts);
export const uploadProductVideo = (file: File, onProgress?: (fraction: number) => void): Promise<string> =>
  sendVideo('/admin/uploads/video', file, onProgress);

/** Older photos without a card-sized copy, a page at a time. */
export const fetchThumbless = async (after?: string): Promise<{ items: { name: string; url: string; length: number }[]; next: string | null }> =>
  (await api.get('/admin/uploads/thumbless', { params: { after } })).data.data;
export const saveThumb = async (name: string, thumb: File): Promise<void> => {
  const body = new FormData();
  body.append('thumb', thumb);
  await api.post(`/admin/uploads/thumbs/${encodeURIComponent(name)}`, body, { timeout: 60000 });
};
/* ---------- categories ---------- */
export const fetchCategories = async (): Promise<Category[]> => (await api.get('/admin/categories')).data.data;

export const createCategory = async (
  body: Pick<Category, 'name' | 'nameHi' | 'level' | 'icon' | 'image' | 'tint' | 'sortOrder' | 'isActive'> & { parent: string | null },
): Promise<Category> => (await api.post('/admin/categories', body)).data.data;

export const updateCategory = async (id: string, body: Partial<Category>): Promise<Category> =>
  (await api.patch(`/admin/categories/${id}`, body)).data.data;

export const deleteCategory = async (id: string): Promise<void> => {
  await api.delete(`/admin/categories/${id}`);
};

/* ---------- orders ---------- */
export const fetchOrders = (params: { page?: number; limit?: number; status?: string; q?: string; rider?: string }) =>
  paged<Order>('/admin/orders', params);

export const fetchOrder = async (id: string): Promise<Order> => (await api.get(`/admin/orders/${id}`)).data.data;

export const updateOrderStatus = async (id: string, status: OrderStatus, note?: string): Promise<Order> =>
  (await api.patch(`/admin/orders/${id}/status`, { status, note })).data.data;

/* ---------- bills: a short-lived link opens the invoice / POS bill in a new tab ---------- */
export interface InvoiceLinks { a4: string; pos: string; expiresAt: string }
export const adminInvoiceLink = async (id: string): Promise<InvoiceLinks> => (await api.post(`/admin/orders/${id}/invoice-link`)).data.data;
export const sellerInvoiceLink = async (id: string): Promise<InvoiceLinks> => (await api.post(`/seller/orders/${id}/invoice-link`)).data.data;

/* ---------- shops ---------- */
export const fetchShops = (params: { page?: number; limit?: number }) => paged<Shop>('/admin/shops', params);

// Product selectors need every warehouse, not only the first page.
export async function fetchAllShops(): Promise<Shop[]> {
  const shops: Shop[] = [];
  let page = 1;
  while (true) {
    const result = await fetchShops({ page, limit: 50 });
    shops.push(...result.items);
    if (!result.meta.hasNext) return shops;
    page += 1;
  }
}

export const createShop = async (
  body: Partial<Shop> & { location: { lat: number; lng: number } },
): Promise<Shop> => (await api.post('/admin/shops', body)).data.data;

export const updateShop = async (
  id: string,
  body: Partial<Omit<Shop, 'location'>> & { location?: { lat: number; lng: number } },
): Promise<Shop> => (await api.patch(`/admin/shops/${id}`, body)).data.data;

export const deleteShop = async (id: string): Promise<void> => {
  await api.delete(`/admin/shops/${id}`);
};

export const createRider = async (body: { name: string; phone: string; email?: string; password: string; warehouses: string[] }): Promise<AppUser> =>
  (await api.post('/admin/riders', body)).data.data;

/* ---------- users ---------- */
export const fetchUsers = (params: { page?: number; limit?: number; role?: string; q?: string }) =>
  paged<AppUser>('/admin/users', params);

export const updateUser = async (
  id: string,
  body: { isActive?: boolean; role?: string; warehouse?: string | null; warehouses?: string[]; name?: string; phone?: string; email?: string; password?: string },
): Promise<AppUser> => (await api.patch(`/admin/users/${id}`, body)).data.data;

export const deleteUser = async (id: string): Promise<void> => {
  await api.delete(`/admin/users/${id}`);
};

/* ---------- banners ---------- */
export type MediaInput = Omit<import('../types').MediaItem, '_id' | 'videoType' | 'embedUrl'>;
export const fetchMedia = async (kind: 'photo' | 'video'): Promise<import('../types').MediaItem[]> => (await api.get('/admin/media', { params: { kind } })).data.data;
export const createMedia = async (body: MediaInput) => (await api.post('/admin/media', body)).data.data;
export const updateMedia = async (id: string, body: Partial<MediaInput>) => (await api.patch(`/admin/media/${id}`, body)).data.data;
export const deleteMedia = async (id: string): Promise<void> => {
  await api.delete(`/admin/media/${id}`);
};

export type BannerInput = Omit<Banner, '_id' | 'category'> & { category: string | null };

export const fetchBanners = async (): Promise<Banner[]> => (await api.get('/admin/banners')).data.data;

export const createBanner = async (body: BannerInput): Promise<Banner> => (await api.post('/admin/banners', body)).data.data;

export const updateBanner = async (id: string, body: Partial<BannerInput>): Promise<Banner> =>
  (await api.patch(`/admin/banners/${id}`, body)).data.data;

export const deleteBanner = async (id: string): Promise<void> => {
  await api.delete(`/admin/banners/${id}`);
};

/* ---------- coupons / offers ---------- */
export const fetchCoupons = (params: { page?: number; limit?: number; q?: string; isActive?: boolean }) =>
  paged<Coupon>('/admin/coupons', params);

export const createCoupon = async (body: Partial<Coupon>): Promise<Coupon> =>
  (await api.post('/admin/coupons', body)).data.data;

export const updateCoupon = async (id: string, body: Partial<Coupon>): Promise<Coupon> =>
  (await api.patch(`/admin/coupons/${id}`, body)).data.data;

export const deleteCoupon = async (id: string): Promise<void> => {
  await api.delete(`/admin/coupons/${id}`);
};

/* ---------- my account ---------- */
export const fetchMe = async (): Promise<AdminUser & { lastLoginAt?: string; createdAt?: string }> =>
  (await api.get('/admin/me')).data.data;

export const updateMe = async (body: { name?: string; email?: string; phone?: string }): Promise<AdminUser> =>
  (await api.patch('/admin/me', body)).data.data;

export const changeMyPassword = async (
  currentPassword: string,
  newPassword: string,
): Promise<{ accessToken: string; refreshToken: string }> =>
  (await api.post('/admin/me/password', { currentPassword, newPassword })).data.data;

/* ---------- settings ---------- */
export const fetchSettings = async (): Promise<Settings> => (await api.get('/admin/settings')).data.data;

export const saveSettings = async (body: DeepPartial<Settings>): Promise<Settings> =>
  (await api.patch('/admin/settings', body)).data.data;

export interface Withdrawal {
  _id: string;
  rider?: { _id: string; name: string; phone: string; payout?: { upi?: string; bankHolder?: string; bankNumber?: string; bankIfsc?: string } } | string;
  amount: number;
  status: 'pending' | 'paid' | 'rejected';
  method?: 'upi' | 'bank';
  destination?: string;
  reference?: string;
  payoutId?: string;
  payoutStatus?: string;
  note?: string;
  createdAt: string;
}

export interface WalletTxnRow {
  _id: string;
  kind: 'earning' | 'bonus' | 'adjustment' | 'withdrawal' | 'cash_submit';
  amount: number;
  status: 'completed' | 'pending' | 'paid' | 'rejected' | 'confirmed';
  note?: string; km?: number; reference?: string; method?: 'upi' | 'bank'; destination?: string; createdAt: string;
}

export interface RiderProfileFull {
  rider: {
    _id: string; name: string; phone: string; email: string | null; isActive: boolean; paused: boolean;
    pausedAt: string | null; longDistance: boolean; online: boolean; lastSeenAt: string | null; createdAt: string;
    warehouses: { _id: string; name: string }[];
    payout: { upi?: string; bankHolder?: string; bankNumber?: string; bankIfsc?: string } | null;
  };
  finance: { balance: number; lifetimeEarned: number; pendingWithdraw: number; withdrawnTotal: number; codPending: number; codCollected: number };
  analytics: { series: { date: string; amount: number; deliveries: number }[]; today: number; week: number; month: number; deliveries: number; delivered: number; cancelled: number; avgPerDelivery: number };
  recentTxns: WalletTxnRow[];
  withdrawals: WalletTxnRow[];
}

export const fetchRiderProfile = async (id: string): Promise<RiderProfileFull> =>
  (await api.get(`/admin/riders/${id}/profile`)).data.data;

export const fetchWithdrawals = async (status = 'pending', page = 1): Promise<{ items: Withdrawal[]; meta: { total: number; totalPages: number; hasNext: boolean; pendingTotal: number } }> => {
  const { data } = await api.get('/admin/withdrawals', { params: { status, page, limit: 20 } });
  return { items: data.data, meta: data.meta };
};
export const markWithdrawal = async (id: string, status: 'paid' | 'rejected', reference?: string): Promise<void> => {
  await api.post(`/admin/withdrawals/${id}/mark`, { status, reference });
};
export const payWithdrawal = async (id: string): Promise<void> => {
  await api.post(`/admin/withdrawals/${id}/pay`);
};
export const refundOrder = async (id: string): Promise<void> => {
  await api.post(`/admin/orders/${id}/refund`);
};
export const giveRiderBonus = async (riderId: string, amount: number, note?: string): Promise<void> => {
  await api.post(`/admin/riders/${riderId}/bonus`, { amount, note });
};

type DeepPartial<T> = { [K in keyof T]?: T[K] extends object ? DeepPartial<T[K]> : T[K] };

/* ---------- notification bell ---------- */
export const fetchNotices = async (): Promise<Notice[]> => (await api.get('/admin/notices')).data.data;

export const createNotice = async (message: string): Promise<Notice> =>
  (await api.post('/admin/notices', { message })).data.data;

export const deleteNotice = async (id: string): Promise<void> => {
  await api.delete(`/admin/notices/${id}`);
};

/* ---------- chat with customer care ---------- */
export const fetchTickets = (params: { page?: number; limit?: number; status?: string }) =>
  paged<Ticket>('/admin/tickets', params) as Promise<{ items: Ticket[]; meta: PageMeta & { unread?: number } }>;

export const fetchTicket = async (id: string): Promise<Ticket> => (await api.get(`/admin/tickets/${id}`)).data.data;

export const replyTicket = async (id: string, text: string): Promise<Ticket> =>
  (await api.post(`/admin/tickets/${id}/reply`, { text })).data.data;

export const setTicketStatus = async (id: string, status: 'open' | 'closed'): Promise<Ticket> =>
  (await api.patch(`/admin/tickets/${id}`, { status })).data.data;

/* ---------- "notify me" requests ---------- */
export const fetchStockAlerts = (params: { page?: number; limit?: number }) => paged<StockAlert>('/admin/stock-alerts', params);

export const setStockAlertNotified = async (id: string, notified: boolean): Promise<StockAlert> =>
  (await api.patch(`/admin/stock-alerts/${id}`, { notified })).data.data;

export const deleteStockAlert = async (id: string): Promise<void> => {
  await api.delete(`/admin/stock-alerts/${id}`);
};

/* ---------- riders: online, COD, pause ---------- */
export const fetchRiders = async (params: { q?: string; online?: boolean } = {}): Promise<{ items: RiderRow[]; meta: RiderTotals }> => {
  const { data } = await api.get('/admin/riders', { params });
  return { items: data.data, meta: data.meta };
};

export const setRiderPaused = async (id: string, paused: boolean): Promise<void> => {
  await api.patch(`/admin/riders/${id}/pause`, { paused });
};

export const settleRiderCod = async (id: string): Promise<void> => {
  await api.post(`/admin/riders/${id}/settle-cod`);
};

/* ---------- dashboard bell ---------- */
export const fetchAdminAlerts = async (): Promise<{ items: AdminAlert[]; unread: number }> => {
  const { data } = await api.get('/admin/alerts');
  return { items: data.data, unread: data.meta?.unread ?? 0 };
};

export const markAdminAlertsRead = async (): Promise<void> => {
  await api.post('/admin/alerts/read');
};

export const setRiderLongDistance = async (id: string, longDistance: boolean): Promise<void> => {
  await api.patch(`/admin/riders/${id}/long-distance`, { longDistance });
};

/* ---------- contact forms ---------- */
export const fetchEnquiries = (params: { page?: number; limit?: number; kind?: string }) => paged<Enquiry>('/admin/enquiries', params);
export const deleteEnquiry = async (id: string): Promise<void> => {
  await api.delete(`/admin/enquiries/${id}`);
};

/* ---------- sellers ---------- */
export const fetchSellers = (params: { page?: number; limit?: number; q?: string }) => paged<SellerRow>('/admin/sellers', params);
export const createSeller = async (body: { name: string; phone: string; email?: string; password: string; warehouses: string[] }) =>
  (await api.post('/admin/sellers', body)).data.data;
export const setSellerWarehouses = async (id: string, warehouses: string[]): Promise<void> => {
  await api.patch(`/admin/sellers/${id}/warehouses`, { warehouses });
};
export const clearSellerProfile = async (id: string): Promise<void> => {
  await api.delete(`/admin/sellers/${id}/profile`);
};
export const setSellerActive = async (id: string, isActive: boolean): Promise<void> => {
  await api.patch(`/admin/sellers/${id}/active`, { isActive });
};

/* ---------- seller panel (a seller's own session) ---------- */
export const sellerMe = async (): Promise<{
  user: { name: string; phone: string; email?: string; sellerId?: string; sellerProfile?: SellerProfile };
  stats: SellerStats;
}> => (await api.get('/seller/me')).data.data;
export const sellerAckOrders = async (): Promise<void> => {
  await api.post('/seller/ack-orders');
};
export const sellerSaveProfile = async (body: Record<string, unknown>): Promise<{ sellerId: string; sellerProfile: SellerProfile }> =>
  (await api.put('/seller/profile', body)).data.data;
export const sellerCategories = async (): Promise<{ _id: string; name: string; nameHi?: string; parent: string | null; level: 1 | 2 | 3 }[]> =>
  (await api.get('/seller/categories')).data.data;
export const sellerProducts = (params: { page?: number; limit?: number; q?: string; status?: string; category?: string }) => paged<import('../types').Product>('/seller/products', params);
export const sellerBulkProducts = async (rows: Record<string, string>[], dryRun: boolean): Promise<import('../components/BulkUpload').BulkResponse> =>
  (await api.post('/seller/products/bulk', { rows, dryRun })).data.data;
export const sellerCreateProduct = async (body: Record<string, unknown>) => (await api.post('/seller/products', body)).data.data;
export const sellerUpdateProduct = async (id: string, body: Record<string, unknown>) => (await api.patch(`/seller/products/${id}`, body)).data.data;
export const sellerUploadVideo = (file: File, onProgress?: (fraction: number) => void): Promise<string> =>
  sendVideo('/seller/uploads/video', file, onProgress);
/** Sellers are capped at 200 KB a photo on the server, so photos are shrunk to fit. */
export const sellerUploadImages = (files: File[], opts?: UploadOptions): Promise<string[]> =>
  sendImages('/seller/uploads/images', files, { maxBytes: 190 * 1024, ...opts });

/* ---------- seller earnings wallet (seller's own session) ---------- */
export interface SellerWallet {
  balance: number;
  netEarned: number;
  grossSales: number;
  commissionTotal: number;
  pendingWithdraw: number;
  paidOut: number;
  minWithdraw: number;
  commissionPct: number;
  account: { upi?: string; bankHolder?: string; bankNumber?: string; bankIfsc?: string } | null;
}
export interface SellerTxnRow {
  _id: string;
  kind: 'earning' | 'adjustment' | 'withdrawal';
  amount: number;
  status: 'completed' | 'pending' | 'paid' | 'rejected';
  gross?: number; commission?: number; commissionPct?: number;
  method?: 'upi' | 'bank'; destination?: string; reference?: string; payoutStatus?: string; note?: string; createdAt: string;
}
export const sellerWallet = async (): Promise<SellerWallet> => (await api.get('/seller/wallet')).data.data;
export const sellerWalletTxns = (params: { page?: number; limit?: number; kind?: string }) => paged<SellerTxnRow>('/seller/wallet/txns', params);
export const sellerSaveWalletAccount = async (body: { upi?: string; bankHolder?: string; bankNumber?: string; bankIfsc?: string }): Promise<void> => {
  await api.post('/seller/wallet/account', body);
};
export const sellerRequestWithdraw = async (amount: number, method: 'upi' | 'bank'): Promise<void> => {
  await api.post('/seller/wallet/withdraw', { amount, method });
};

/* ---------- seller payouts (super admin) ---------- */
export interface SellerWithdrawal {
  _id: string;
  seller?: { _id: string; name: string; phone: string; sellerId?: string; payout?: { upi?: string; bankNumber?: string; bankIfsc?: string; bankHolder?: string } } | string;
  amount: number;
  status: 'pending' | 'paid' | 'rejected';
  method?: 'upi' | 'bank';
  destination?: string;
  reference?: string;
  payoutId?: string;
  payoutStatus?: string;
  createdAt: string;
}
export const fetchSellerWithdrawals = async (status = 'pending', page = 1): Promise<{ items: SellerWithdrawal[]; meta: { total: number; totalPages: number; hasNext: boolean; pendingTotal: number } }> => {
  const { data } = await api.get('/admin/seller-withdrawals', { params: { status, page, limit: 20 } });
  return { items: data.data, meta: data.meta };
};
export const markSellerWithdrawal = async (id: string, status: 'paid' | 'rejected', reference?: string): Promise<void> => {
  await api.post(`/admin/seller-withdrawals/${id}/mark`, { status, reference });
};
export const paySellerWithdrawal = async (id: string): Promise<void> => {
  await api.post(`/admin/seller-withdrawals/${id}/pay`);
};

/* ---------- provider wallet (provider's own session) ---------- */
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
export type ProviderTxnKind = 'earning' | 'commission' | 'commission_paid' | 'withdrawal' | 'adjustment';
export interface ProviderTxnRow {
  _id: string;
  kind: ProviderTxnKind;
  amount: number;
  status: 'completed' | 'pending' | 'paid' | 'rejected' | 'confirmed';
  bookingNumber?: string;
  gross?: number; commission?: number; commissionPct?: number; paymentMethod?: 'cod' | 'online';
  method?: 'upi' | 'bank' | 'cash' | 'wallet'; destination?: string; reference?: string; payoutStatus?: string; note?: string; createdAt: string;
  provider?: { _id: string; name: string; phone: string; providerId?: string; payout?: PayoutAccount } | string;
}
export const providerWallet = async (): Promise<ProviderWallet> => (await api.get('/provider/wallet')).data.data;
export const providerWalletTxns = (params: { page?: number; limit?: number; kind?: ProviderTxnKind }) => paged<ProviderTxnRow>('/provider/wallet/txns', params);
export const providerSaveWalletAccount = async (body: PayoutAccount): Promise<void> => {
  await api.post('/provider/wallet/account', body);
};
export const providerRequestWithdraw = async (amount: number, method: 'upi' | 'bank'): Promise<void> => {
  await api.post('/provider/wallet/withdraw', { amount, method });
};
export const providerPayDues = async (body: { method: 'wallet' | 'cash' | 'upi'; amount?: number; reference?: string }): Promise<void> => {
  await api.post('/provider/wallet/pay-dues', body);
};

/* ---------- provider payouts & commission dues (super admin) ---------- */
export interface ProviderDueRow { _id: string; name: string; phone: string; providerId?: string; providerDue: number; providerApplication?: { firm?: string } }
export const fetchProviderDues = async (q?: string): Promise<{ providers: ProviderDueRow[]; payments: ProviderTxnRow[]; totalDue: number }> =>
  (await api.get('/admin/provider-payouts/dues', { params: q ? { q } : {} })).data.data;
export const markProviderDuesPayment = async (id: string, status: 'confirmed' | 'rejected', reference?: string): Promise<void> => {
  await api.post(`/admin/provider-payouts/dues/${id}/mark`, { status, reference });
};
export const collectProviderDues = async (providerId: string, amount?: number, note?: string): Promise<void> => {
  await api.post(`/admin/provider-payouts/providers/${providerId}/collect`, { amount, note });
};
export const fetchProviderWithdrawals = async (status = 'pending', page = 1): Promise<{ items: ProviderTxnRow[]; meta: { total: number; totalPages: number; hasNext: boolean; pendingTotal: number } }> => {
  const { data } = await api.get('/admin/provider-payouts/withdrawals', { params: { status, page, limit: 20 } });
  return { items: data.data, meta: data.meta };
};
export const markProviderWithdrawal = async (id: string, status: 'paid' | 'rejected', reference?: string): Promise<void> => {
  await api.post(`/admin/provider-payouts/withdrawals/${id}/mark`, { status, reference });
};
export const payProviderWithdrawal = async (id: string): Promise<void> => {
  await api.post(`/admin/provider-payouts/withdrawals/${id}/pay`);
};

/* ---------- assigning a free rider ---------- */
export interface FreeRider { _id: string; name: string; phone: string; lastSeenAt?: string }
export const adminFreeRiders = async (orderId: string): Promise<FreeRider[]> => (await api.get(`/admin/orders/${orderId}/free-riders`)).data.data;
export const adminAssignRider = async (orderId: string, rider: string): Promise<void> => {
  await api.post(`/admin/orders/${orderId}/assign-rider`, { rider });
};
export const adminAssignShiprocket = async (orderId: string): Promise<void> => {
  await api.post(`/admin/orders/${orderId}/assign-shiprocket`);
};
export const sellerFreeRiders = async (orderId: string): Promise<FreeRider[]> => (await api.get(`/seller/orders/${orderId}/free-riders`)).data.data;
export const sellerAssignRider = async (orderId: string, rider: string): Promise<void> => {
  await api.post(`/seller/orders/${orderId}/assign-rider`, { rider });
};
export const sellerAssignShiprocket = async (orderId: string): Promise<void> => {
  await api.post(`/seller/orders/${orderId}/assign-shiprocket`);
};
export const sellerOrders = (params: { page?: number; limit?: number; status?: string; q?: string }) => paged<Order>('/seller/orders', params);
export const sellerSetOrderStatus = async (id: string, status: string): Promise<void> => {
  await api.patch(`/seller/orders/${id}/status`, { status });
};
export const sellerDeleteProduct = async (id: string): Promise<void> => {
  await api.delete(`/seller/products/${id}`);
};

/* ---------- warehouse panel logins ---------- */
export interface WarehouseLogin { shop: string; _id: string; name: string; phone: string; isActive: boolean }
export const fetchWarehouseLogins = async (): Promise<WarehouseLogin[]> => (await api.get('/admin/shops/logins')).data.data;
export const setWarehouseLogin = async (shopId: string, body: { name?: string; phone: string; password?: string; isActive?: boolean }): Promise<void> => {
  await api.put(`/admin/shops/${shopId}/login`, body);
};
export interface WarehouseRider { _id: string; name: string; phone: string; isActive: boolean; online: boolean; busy: boolean; paused: boolean; lastSeenAt?: string }
export const sellerRiders = async (): Promise<WarehouseRider[]> => (await api.get('/seller/riders')).data.data;
export const sellerCreateRider = async (body: { name: string; phone: string; password: string; warehouses?: string[] }): Promise<void> => {
  await api.post('/seller/riders', body);
};

/* ---------- standard categories (home-screen rows on the top / bottom) ---------- */
export const fetchStandardCategories = async (): Promise<StandardCategory[]> => (await api.get('/admin/standard-categories')).data.data;
export const createStandardCategory = async (body: Partial<StandardCategory>): Promise<StandardCategory> =>
  (await api.post('/admin/standard-categories', body)).data.data;
export const updateStandardCategory = async (id: string, body: Partial<StandardCategory>): Promise<StandardCategory> =>
  (await api.patch(`/admin/standard-categories/${id}`, body)).data.data;
export const deleteStandardCategory = async (id: string): Promise<void> => {
  await api.delete(`/admin/standard-categories/${id}`);
};

/* ---------- integrations: Google / Facebook login and Razorpay ---------- */
export interface IntegrationsView {
  googleClientId: string;
  facebookAppId: string;
  facebookSecretSaved: boolean;
  razorpayKeyId: string;
  razorpaySecretSaved: boolean;
  razorpayEnabled: boolean;
  firebaseWeb: Record<'apiKey' | 'authDomain' | 'projectId' | 'appId' | 'messagingSenderId' | 'storageBucket' | 'vapidKey', string>;
  firebaseServiceAccountSaved: boolean;
  firebaseProjectId: string;
  firebaseOtpOnSignup: boolean;
  firebaseOtpOnLogin: boolean;
  firebasePushEnabled: boolean;
  shiprocketEmail: string;
  shiprocketPasswordSaved: boolean;
  shiprocketPickupLocation: string;
  shiprocketChannelId: string;
  shiprocketEnabled: boolean;
  razorpayxAccountNumber: string;
  razorpayxKeyId: string;
  razorpayxSecretSaved: boolean;
  razorpayxEnabled: boolean;
  razorpayxAutoPayout: boolean;
  live: { google: boolean; facebook: boolean; razorpay: boolean; firebaseOtp: boolean; firebasePush: boolean; shiprocket: boolean; razorpayx: boolean };
}
export const fetchIntegrations = async (): Promise<IntegrationsView> => (await api.get('/admin/integrations')).data.data;
export const saveIntegrations = async (body: Record<string, unknown>): Promise<IntegrationsView> =>
  (await api.put('/admin/integrations', body)).data.data;
export const testRazorpayKeys = async (): Promise<string> => (await api.post('/admin/integrations/razorpay/test')).data.data.message;

export const testFirebase = async (): Promise<string> => {
  const d = (await api.post('/admin/integrations/firebase/test')).data.data;
  return `Firebase project "${d.projectId}" accepted the service account. Test push sent to ${d.sentToYourDevices} of your devices.`;
};
export const testShiprocket = async (): Promise<string> => {
  const d = (await api.post('/admin/integrations/shiprocket/test')).data.data as { pickupLocations: string[] };
  const list = d.pickupLocations.length ? d.pickupLocations.join(', ') : 'none set up yet';
  return `Shiprocket accepted these credentials. Pickup locations found: ${list}.`;
};
export const testRazorpayx = async (): Promise<string> => {
  const d = (await api.post('/admin/integrations/razorpayx/test')).data.data as { accountNumber: string };
  return `RazorpayX accepted these keys for account ${d.accountNumber}. Payouts are ready.`;
};

/* ---------- warehouse registrations ---------- */
export const fetchWarehouseApplications = async (params: { status?: string; page?: number; limit?: number }) => {
  const { data } = await api.get('/admin/warehouse-applications', { params });
  return { items: data.data as WarehouseApplication[], pending: (data.meta?.pending ?? 0) as number };
};
export const approveWarehouse = async (id: string): Promise<void> => {
  await api.post(`/admin/warehouse-applications/${id}/approve`);
};
export const rejectWarehouse = async (id: string, reason: string): Promise<void> => {
  await api.post(`/admin/warehouse-applications/${id}/reject`, { reason });
};

/* ---------- warehouse panel: dashboard, store, customers, account ---------- */
export interface WarehouseDashboard {
  orders: { byStatus: Record<string, number>; total: number };
  today: { orders: number; revenue: number };
  deliveredRevenue: number;
  trend: { date: string; orders: number; revenue: number }[];
  topProducts: { _id: string; name: string; qty: number; revenue: number }[];
  lowStock: { _id: string; name: string; stock: number; unit: string; images?: string[] }[];
  outOfStock: number;
  products: { live: number; off: number };
  recent: { _id: string; orderNumber: string; status: string; total: number; createdAt: string; paymentMethod: string }[];
}
export const sellerDashboard = async (): Promise<WarehouseDashboard> => (await api.get('/seller/dashboard')).data.data;
export interface WarehouseShop {
  _id: string;
  name: string;
  gstin?: string;
  description?: string;
  phone?: string;
  logo?: string;
  banner?: string;
  isOpen: boolean;
  isActive: boolean;
  deliveryRadiusKm: number;
  minOrderAmount: number;
  deliveryFee: number;
  address: { line1?: string; city?: string; state?: string; pincode?: string };
  location: { coordinates: [number, number] };
}
export const sellerShops = async (): Promise<WarehouseShop[]> => (await api.get('/seller/shops')).data.data;
export const sellerUpdateShop = async (id: string, body: Record<string, unknown>): Promise<WarehouseShop> => (await api.patch(`/seller/shops/${id}`, body)).data.data;
export interface WarehouseCustomer { _id: string; name: string; phone: string; orders: number; spent: number; last: string }
export const sellerCustomers = (params: { page?: number; limit?: number; q?: string }) => paged<WarehouseCustomer>('/seller/customers', params);
export const sellerChangePassword = async (currentPassword: string, newPassword: string): Promise<void> => {
  await api.post('/seller/change-password', { currentPassword, newPassword });
};

export interface OrderRider { _id: string; name: string; phone: string; lastSeenAt?: string; state: 'free' | 'busy' | 'offline' | 'paused' | 'long_distance_only' | 'not_long_distance'; free: boolean }
export interface OrderRiders { warehouse: string; radiusKm: number | null; distanceKm: number | null; longDistance: boolean; riders: OrderRider[] }
export const sellerOrderRiders = async (orderId: string): Promise<OrderRiders> => (await api.get(`/seller/orders/${orderId}/riders`)).data.data;

/* ---------- rider & warehouse plans ---------- */
export type PlanAudience = 'rider' | 'seller' | 'provider';
export interface Plan {
  _id: string;
  audience: PlanAudience;
  name: string;
  price: number;
  days: number;
  description?: string;
  active: boolean;
  sort: number;
}
export interface PlanOverview {
  switches: Record<PlanAudience, boolean>;
  plans: Plan[];
  rider: { total: number; active: number; revenue: number };
  seller: { total: number; active: number; revenue: number };
  provider?: { total: number; active: number; revenue: number };
}
export interface PlanMember {
  _id: string;
  name: string;
  phone: string;
  sellerId?: string;
  providerId?: string;
  providerApplication?: { firm?: string; city?: string };
  isActive: boolean;
  subscriptionUntil?: string | null;
  planActive: boolean;
  warehouses?: { name: string }[];
  sellerWarehouses?: { name: string }[];
}
export interface PlanPayment {
  _id: string;
  user?: { _id: string; name: string; phone: string; sellerId?: string; role: string } | null;
  audience: PlanAudience;
  source: 'razorpay' | 'admin';
  planName: string;
  days: number;
  amount: number;
  paymentId?: string;
  startsAt?: string;
  endsAt?: string;
  note?: string;
  createdAt: string;
}
export type PlanInput = Pick<Plan, 'name' | 'price' | 'days'> & { description?: string; active?: boolean; sort?: number };

export const fetchPlanOverview = async (): Promise<PlanOverview> => (await api.get('/admin/subscriptions')).data.data;
export const setPlanSwitches = async (body: Partial<Record<PlanAudience, boolean>>): Promise<Record<PlanAudience, boolean>> =>
  (await api.put('/admin/subscriptions/switches', body)).data.data;
export const createPlan = async (body: PlanInput & { audience: PlanAudience }): Promise<Plan> => (await api.post('/admin/subscriptions/plans', body)).data.data;
export const updatePlan = async (id: string, body: Partial<PlanInput>): Promise<Plan> => (await api.patch(`/admin/subscriptions/plans/${id}`, body)).data.data;
export const deletePlan = async (id: string): Promise<{ hidden?: boolean; deleted?: boolean }> => (await api.delete(`/admin/subscriptions/plans/${id}`)).data.data;
export const fetchPlanMembers = (params: { audience: PlanAudience; status?: string; q?: string; page?: number; limit?: number }) =>
  paged<PlanMember>('/admin/subscriptions/members', params);
export const grantPlanDays = async (id: string, days: number, note?: string): Promise<void> => {
  await api.post(`/admin/subscriptions/members/${id}/grant`, { days, note });
};
export const endMemberPlan = async (id: string): Promise<void> => {
  await api.post(`/admin/subscriptions/members/${id}/end`);
};
export const fetchPlanPayments = (params: { audience?: PlanAudience; page?: number; limit?: number }) => paged<PlanPayment>('/admin/subscriptions/payments', params);

/* the warehouse's own plan */
export interface MyPlan {
  required: boolean;
  active: boolean;
  until: string | null;
  daysLeft: number;
  plans: Pick<Plan, '_id' | 'name' | 'price' | 'days' | 'description'>[];
  canPayOnline: boolean;
}
export const fetchMyPlan = async (): Promise<MyPlan> => (await api.get('/subscription')).data.data;
export const startMyPlanPayment = async (planId: string): Promise<{ razorpayOrderId: string; amount: number; currency: string; keyId: string; planName: string }> =>
  (await api.post('/subscription/pay', { planId })).data.data;
export const confirmMyPlanPayment = async (body: { razorpay_order_id: string; razorpay_payment_id: string; razorpay_signature: string }): Promise<MyPlan> =>
  (await api.post('/subscription/confirm', body)).data.data;

/* ---------- team: sub-admins & role-based access (super admin only) ---------- */
export const fetchPermissionDefs = async (): Promise<PermissionDef[]> => (await api.get('/admin/permissions')).data.data;
export const fetchAdmins = async (): Promise<TeamMember[]> => (await api.get('/admin/admins')).data.data;
export interface AdminInput {
  name: string;
  phone: string;
  email?: string;
  password?: string;
  permissions: string[];
  isActive?: boolean;
}
export const createAdmin = async (body: AdminInput): Promise<TeamMember> => (await api.post('/admin/admins', body)).data.data;
export const updateAdmin = async (id: string, body: Partial<AdminInput>): Promise<TeamMember> =>
  (await api.patch(`/admin/admins/${id}`, body)).data.data;
export const deleteAdmin = async (id: string): Promise<void> => {
  await api.delete(`/admin/admins/${id}`);
};

/* ---------- ads & campaigns ---------- */
export const fetchAds = (params: { page?: number; limit?: number; q?: string; placement?: AdPlacement; isActive?: boolean }) =>
  paged<AdCampaign>('/admin/ads', params);
export interface AdInput {
  advertiser: string;
  title: string;
  image: string;
  targetUrl: string;
  placement: AdPlacement;
  startAt?: string | null;
  endAt?: string | null;
  sortOrder?: number;
  isActive?: boolean;
}
export const createAd = async (body: AdInput): Promise<AdCampaign> => (await api.post('/admin/ads', body)).data.data;
export const updateAd = async (id: string, body: Partial<AdInput>): Promise<AdCampaign> =>
  (await api.patch(`/admin/ads/${id}`, body)).data.data;
export const deleteAd = async (id: string): Promise<void> => {
  await api.delete(`/admin/ads/${id}`);
};

/* ---------- website content pages (CMS) ---------- */
export const fetchPagesList = async (): Promise<ContentPageSummary[]> => (await api.get('/admin/pages')).data.data;
export const fetchPage = async (id: string): Promise<ContentPage> => (await api.get(`/admin/pages/${id}`)).data.data;
export interface PageInput {
  slug: string;
  title: string;
  blocks: ContentPage['blocks'];
  metaDescription?: string;
  isPublished?: boolean;
}
export const createPage = async (body: PageInput): Promise<ContentPage> => (await api.post('/admin/pages', body)).data.data;
export const updatePage = async (id: string, body: Partial<PageInput>): Promise<ContentPage> =>
  (await api.patch(`/admin/pages/${id}`, body)).data.data;
export const deletePage = async (id: string): Promise<void> => {
  await api.delete(`/admin/pages/${id}`);
};

/* ============ Services vertical ============ */

/* ---- public category list (used by the provider panel's service form) ---- */
export const serviceCategories = async (): Promise<ServiceCategoryRow[]> => (await api.get('/service-categories')).data.data;

/* ---- provider panel ---- */
export interface ProviderMe {
  _id: string; name: string; phone: string; email?: string;
  providerId?: string; providerStatus?: string; providerBusy?: boolean;
  providerApplication?: ProviderApplication['providerApplication'];
}
export interface ProviderDashboard {
  totalServices: number; activeServices: number; bookings: number;
  bookingsByStatus: Record<string, number>; todaysBookings: number; earnings: number;
  /** Commission owed on cash bookings; when blocked the provider gets no new bookings. */
  due?: number; blockedByDues?: boolean;
}
export const providerMe = async (): Promise<ProviderMe> => (await api.get('/provider/me')).data.data;
export const providerDashboard = async (): Promise<ProviderDashboard> => (await api.get('/provider/dashboard')).data.data;
export const providerSetAvailability = async (available: boolean): Promise<void> => {
  await api.post('/provider/availability', { available });
};
export const providerServices = async (): Promise<ServiceRow[]> => (await api.get('/provider/services')).data.data;
export const providerCreateService = async (body: Record<string, unknown>): Promise<ServiceRow> =>
  (await api.post('/provider/services', body)).data.data;
export const providerUpdateService = async (id: string, body: Record<string, unknown>): Promise<ServiceRow> =>
  (await api.patch(`/provider/services/${id}`, body)).data.data;
export const providerUploadImages = (files: File[], opts?: UploadOptions): Promise<string[]> =>
  sendImages('/provider/uploads/images', files, { maxBytes: 900 * 1024, ...opts });
export const providerUploadVideo = (file: File, onProgress?: (fraction: number) => void): Promise<string> =>
  sendVideo('/provider/uploads/video', file, onProgress);
export const providerDeleteService = async (id: string): Promise<void> => {
  await api.delete(`/provider/services/${id}`);
};
export const providerBookings = (params: { page?: number; limit?: number; status?: string }) =>
  paged<ServiceBookingRow>('/provider/bookings', params);
export const providerBooking = async (id: string): Promise<ServiceBookingRow> =>
  (await api.get(`/provider/bookings/${id}`)).data.data;
export const providerSetBookingStatus = async (id: string, status: string, otp?: string): Promise<void> => {
  await api.patch(`/provider/bookings/${id}/status`, { status, otp });
};
export const providerCancelBooking = async (id: string, reason?: string): Promise<void> => {
  await api.post(`/provider/bookings/${id}/cancel`, { reason });
};
export const providerRing = async (): Promise<RingItem[]> => (await api.get('/provider/ring')).data.data;
export const providerAcceptRing = async (dispatchId: string): Promise<ServiceBookingRow> =>
  (await api.post(`/provider/ring/${dispatchId}/accept`)).data.data;
export const providerDeclineRing = async (dispatchId: string): Promise<void> => {
  await api.post(`/provider/ring/${dispatchId}/decline`);
};

/* ---- admin: provider approvals ---- */
export const fetchProviderApplications = async (params: { status?: string; page?: number; limit?: number }) => {
  const { data } = await api.get('/admin/providers', { params });
  return { items: data.data as ProviderApplication[], pending: (data.meta?.pending ?? 0) as number };
};
export const approveProvider = async (id: string): Promise<void> => {
  await api.post(`/admin/providers/${id}/approve`);
};
export const adminUpdateProvider = async (id: string, body: Record<string, unknown>): Promise<{ _id: string; phone: string; isActive: boolean }> =>
  (await api.patch(`/admin/providers/${id}`, body)).data.data;
export const adminDeleteProvider = async (id: string): Promise<{ deleted: boolean; kept?: boolean }> =>
  (await api.delete(`/admin/providers/${id}`)).data.data;
export const adminCreateProvider = async (body: Record<string, unknown>): Promise<{ _id: string; name: string; phone: string; email?: string; providerId?: string }> =>
  (await api.post('/admin/providers', body)).data.data;
export const rejectProvider = async (id: string, reason: string): Promise<void> => {
  await api.post(`/admin/providers/${id}/reject`, { reason });
};

/* ---- admin: service categories ---- */
export const adminServiceCategories = async (): Promise<ServiceCategoryRow[]> => (await api.get('/admin/service-categories')).data.data;
export const adminCreateServiceCategory = async (body: Record<string, unknown>): Promise<ServiceCategoryRow> =>
  (await api.post('/admin/service-categories', body)).data.data;
export const adminUpdateServiceCategory = async (id: string, body: Record<string, unknown>): Promise<ServiceCategoryRow> =>
  (await api.patch(`/admin/service-categories/${id}`, body)).data.data;
export const adminDeleteServiceCategory = async (id: string): Promise<void> => {
  await api.delete(`/admin/service-categories/${id}`);
};

/* ---- admin: all service bookings ---- */
export const adminServiceBookings = (params: { page?: number; limit?: number; status?: string }) =>
  paged<ServiceBookingRow>('/admin/service-bookings', params);
