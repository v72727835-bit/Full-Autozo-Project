import { API_URL } from './config';
import type { PublicSettings } from './types';

/** Where the backend serves the newest APKs (refreshed by update-apks.sh on every deploy). */
const DOWNLOADS = `${API_URL.replace(/\/api\/v\d+\/?$/, '')}/downloads`;

/** App download links: the admin panel's links when set, otherwise the latest APKs on our own server. */
export function appDownloads(settings: PublicSettings | null) {
  const links = settings?.appLinks ?? {};
  return {
    customer: links.android || `${DOWNLOADS}/autozo-customer.apk`,
    rider: links.rider || `${DOWNLOADS}/autozo-rider.apk`,
    warehouse: links.warehouse || `${DOWNLOADS}/autozo-warehouse.apk`,
    provider: links.provider || `${DOWNLOADS}/autozo-provider.apk`,
    ios: links.ios,
  };
}
