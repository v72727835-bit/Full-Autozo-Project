/**
 * Role-based access for the admin panel.
 *
 * There are two kinds of admin accounts:
 *  - a **super admin** (`isSuperAdmin !== false`) can do everything, including
 *    creating and managing other admins. Every admin that existed before this
 *    feature is treated as a super admin, so nobody is locked out.
 *  - a **sub admin** (`isSuperAdmin === false`) is created by a super admin and
 *    can only reach the sections listed in their `adminPermissions`.
 *
 * Enforcement is central: one gate (see middleware/auth.ts) maps the request
 * path to a permission key, so individual routes don't each have to opt in.
 */
export const ADMIN_PERMISSIONS = [
  { key: 'orders', label: 'Orders' },
  { key: 'products', label: 'Products & inventory' },
  { key: 'categories', label: 'Categories' },
  { key: 'banners', label: 'Banners' },
  { key: 'offers', label: 'Offers & coupons' },
  { key: 'ads', label: 'Ads & campaigns' },
  { key: 'pages', label: 'Website pages' },
  { key: 'riders', label: 'Riders' },
  { key: 'payouts', label: 'Payouts' },
  { key: 'users', label: 'Users & team' },
  { key: 'shops', label: 'Warehouses & sellers' },
  { key: 'subscriptions', label: 'Subscriptions' },
  { key: 'media', label: 'Media & notices' },
  { key: 'support', label: 'Support' },
  { key: 'enquiries', label: 'Enquiries' },
  { key: 'settings', label: 'Settings' },
  { key: 'integrations', label: 'Integrations' },
] as const;

export type AdminPermission = (typeof ADMIN_PERMISSIONS)[number]['key'];

export const ALL_PERMISSION_KEYS: AdminPermission[] = ADMIN_PERMISSIONS.map((p) => p.key);

export function isValidPermission(key: string): key is AdminPermission {
  return ALL_PERMISSION_KEYS.includes(key as AdminPermission);
}

/**
 * Which permission a given admin-API path needs. Ordered most-specific first so
 * e.g. `seller-withdrawals` maps to payouts, not to shops. A `null` result means
 * the path is open to every logged-in admin (dashboard, own profile, uploads).
 */
const SECTION_MAP: Array<{ test: RegExp; perm: AdminPermission }> = [
  { test: /(?:^|\/)orders(?:\/|$)/, perm: 'orders' },
  { test: /(?:^|\/)products(?:\/|$)/, perm: 'products' },
  { test: /(?:^|\/)stock-alerts(?:\/|$)/, perm: 'products' },
  { test: /(?:^|\/)standard-categories(?:\/|$)/, perm: 'settings' },
  { test: /(?:^|\/)categories(?:\/|$)/, perm: 'categories' },
  { test: /(?:^|\/)banners(?:\/|$)/, perm: 'banners' },
  { test: /(?:^|\/)coupons(?:\/|$)/, perm: 'offers' },
  { test: /(?:^|\/)ads(?:\/|$)/, perm: 'ads' },
  { test: /(?:^|\/)pages(?:\/|$)/, perm: 'pages' },
  { test: /(?:^|\/)seller-withdrawals(?:\/|$)/, perm: 'payouts' },
  { test: /(?:^|\/)provider-payouts(?:\/|$)/, perm: 'payouts' },
  { test: /(?:^|\/)withdrawals(?:\/|$)/, perm: 'payouts' },
  { test: /(?:^|\/)cash-submits(?:\/|$)/, perm: 'payouts' },
  { test: /(?:^|\/)riders(?:\/|$)/, perm: 'riders' },
  { test: /(?:^|\/)sellers(?:\/|$)/, perm: 'shops' },
  { test: /(?:^|\/)shops(?:\/|$)/, perm: 'shops' },
  { test: /(?:^|\/)warehouse-applications(?:\/|$)/, perm: 'shops' },
  { test: /(?:^|\/)users(?:\/|$)/, perm: 'users' },
  { test: /(?:^|\/)subscriptions(?:\/|$)/, perm: 'subscriptions' },
  { test: /(?:^|\/)integrations(?:\/|$)/, perm: 'integrations' },
  { test: /(?:^|\/)settings(?:\/|$)/, perm: 'settings' },
  { test: /(?:^|\/)media(?:\/|$)/, perm: 'media' },
  { test: /(?:^|\/)notices(?:\/|$)/, perm: 'media' },
  { test: /(?:^|\/)tickets(?:\/|$)/, perm: 'support' },
  { test: /(?:^|\/)enquiries(?:\/|$)/, perm: 'enquiries' },
];

export function permissionForPath(path: string): AdminPermission | null {
  for (const { test, perm } of SECTION_MAP) if (test.test(path)) return perm;
  return null;
}
