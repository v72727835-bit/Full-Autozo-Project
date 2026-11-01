import { API_URL } from './config';
import type { PublicSettings } from './types';

/** Where the backend serves the newest APKs (refreshed by update-apks.sh on every deploy). */
const DOWNLOADS = `${API_URL.replace(/\/api\/v\d+\/?$/, '')}/downloads`;

/**
 * Our own APKs live only on the API server. A link the admin typed as
 * "autozo.org/downloads/autozo-rider.apk" (or "/downloads/…") would hit the
 * website and 404, so any link to one of our APK files is pointed at the API
 * server. Links to other places (Play Store etc.) are left alone.
 */
function fixLink(link: string | undefined, file: string): string {
  if (!link) return `${DOWNLOADS}/${file}`;
  const own = link.match(/^(?:https?:\/\/[^/]*autozo\.org)?\/downloads\/(autozo-[a-z]+\.apk)(?:[?#].*)?$/i);
  return own ? `${DOWNLOADS}/${own[1]}` : link;
}

/** App download links: the admin panel's links when set, otherwise the latest APKs on our own server. */
export function appDownloads(settings: PublicSettings | null) {
  const links = settings?.appLinks ?? {};
  return {
    customer: fixLink(links.android, 'autozo-customer.apk'),
    rider: fixLink(links.rider, 'autozo-rider.apk'),
    warehouse: fixLink(links.warehouse, 'autozo-warehouse.apk'),
    provider: fixLink(links.provider, 'autozo-provider.apk'),
    ios: links.ios,
  };
}
