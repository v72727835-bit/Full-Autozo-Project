export {};

declare global {
  namespace Express {
    interface Request {
      user?: {
        id: string;
        role: 'customer' | 'rider' | 'shop' | 'admin' | 'seller' | 'provider';
        /** Admins: a super admin can do everything; a sub admin is limited to `permissions`. */
        isSuperAdmin?: boolean;
        permissions?: string[];
      };
    }
  }
}
