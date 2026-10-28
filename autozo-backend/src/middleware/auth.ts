import { RequestHandler } from 'express';
import { User } from '../models/User';
import { ApiError } from '../utils/ApiError';
import { asyncHandler } from '../utils/asyncHandler';
import { verifyAccessToken } from '../utils/jwt';
import { permissionForPath } from '../config/permissions';

/** Requires a valid access token (Authorization: Bearer <token>). */
export const protect = asyncHandler(async (req, _res, next) => {
  const header = req.headers.authorization;
  if (!header?.startsWith('Bearer ')) throw new ApiError(401, 'Authentication required');

  const payload = verifyAccessToken(header.slice(7));
  const user = await User.findById(payload.sub).select('role isActive isSuperAdmin adminPermissions').lean();
  if (!user || !user.isActive) throw new ApiError(401, 'Account not found or disabled');

  req.user = { id: String(user._id), role: user.role };
  if (user.role === 'admin') {
    // A sub admin is an admin that was explicitly created with isSuperAdmin:false
    // and a permission list. Everyone else (incl. legacy admins) is a super admin.
    req.user.isSuperAdmin = user.isSuperAdmin !== false;
    req.user.permissions = Array.isArray(user.adminPermissions) ? user.adminPermissions : [];
  }
  next();
});

/** Restricts a route to specific roles. Use after `protect`. */
export const authorize =
  (...roles: Array<'customer' | 'rider' | 'shop' | 'admin' | 'seller' | 'provider'>): RequestHandler =>
  (req, _res, next) => {
    if (!req.user || !roles.includes(req.user.role)) {
      return next(new ApiError(403, 'You do not have access to this resource'));
    }
    next();
  };

/** True when the admin on the request may use the given section. */
export function adminHasPermission(
  user: { isSuperAdmin?: boolean; permissions?: string[] } | undefined,
  perm: string,
): boolean {
  if (!user) return false;
  if (user.isSuperAdmin) return true;
  return (user.permissions ?? []).includes(perm);
}

/** Requires a specific admin permission (super admins always pass). Use after `adminOnly`. */
export const requirePermission =
  (perm: string): RequestHandler =>
  (req, _res, next) => {
    if (!adminHasPermission(req.user, perm)) return next(new ApiError(403, 'You do not have access to this section'));
    next();
  };

/** Only a super admin may continue — used for managing other admins. */
export const superAdminOnly: RequestHandler = (req, _res, next) => {
  if (!req.user || req.user.role !== 'admin' || !req.user.isSuperAdmin) {
    return next(new ApiError(403, 'Only a super admin can manage team members'));
  }
  next();
};

/**
 * Central role-based access gate for the admin router. Super admins pass
 * everything; a sub admin is allowed only on paths whose section is in their
 * permission list. Paths with no section (dashboard, own profile, uploads) are
 * open to every admin.
 */
export const permissionGate: RequestHandler = (req, _res, next) => {
  if (!req.user || req.user.role !== 'admin') return next(new ApiError(403, 'You do not have access to this resource'));
  if (req.user.isSuperAdmin) return next();
  const perm = permissionForPath(req.path);
  if (perm && !(req.user.permissions ?? []).includes(perm)) {
    return next(new ApiError(403, 'You do not have access to this section'));
  }
  next();
};

/** Everything in the public portal that needs a logged-in customer. */
export const customerOnly: RequestHandler[] = [protect, authorize('customer')];

/** Everything in the admin panel. */
export const adminOnly: RequestHandler[] = [protect, authorize('admin')];
