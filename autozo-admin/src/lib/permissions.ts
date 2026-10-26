import type { AdminUser } from '../types';

/**
 * Permission keys, mirroring the backend catalogue in
 * autozo-backend/src/config/permissions.ts. Used to hide panel sections a
 * sub-admin was not granted. The backend enforces the same rules on the API,
 * so this is only about what the UI shows.
 */
export const ALL_PERMISSIONS = [
  'orders',
  'products',
  'categories',
  'banners',
  'offers',
  'ads',
  'pages',
  'riders',
  'payouts',
  'users',
  'shops',
  'subscriptions',
  'media',
  'support',
  'enquiries',
  'settings',
  'integrations',
] as const;

export type Permission = (typeof ALL_PERMISSIONS)[number];

/** A super admin (the default, incl. every admin created before this feature). */
export function isSuperAdmin(user: AdminUser | null | undefined): boolean {
  return !!user && user.role === 'admin' && user.isSuperAdmin !== false;
}

/** The set of sections an admin may use (super admins get all of them). */
export function permissionsOf(user: AdminUser | null | undefined): Set<string> {
  if (!user || user.role !== 'admin') return new Set();
  if (user.isSuperAdmin !== false) return new Set(ALL_PERMISSIONS);
  // `me` returns `permissions`; the login response carries `adminPermissions`.
  return new Set(user.permissions ?? user.adminPermissions ?? []);
}

export function can(user: AdminUser | null | undefined, perm: Permission): boolean {
  return permissionsOf(user).has(perm);
}
