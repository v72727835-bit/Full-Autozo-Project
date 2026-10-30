export const API_URL = process.env.NEXT_PUBLIC_API_URL ?? 'https://app-api.autozo.org/api/v1';
export const FREE_DELIVERY_ABOVE_FALLBACK = 199;

/** Where service providers, warehouses and admins sign in (the panel app). */
export const PANEL_URL = (process.env.NEXT_PUBLIC_PANEL_URL ?? 'https://panel.autozo.org').replace(/\/+$/, '');
