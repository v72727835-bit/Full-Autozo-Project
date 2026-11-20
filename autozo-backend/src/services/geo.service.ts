import { matchState } from '../utils/indiaStates';

/**
 * Pin -> city / state / PIN / address, from OpenStreetMap's free lookup. Every form on the website and in
 * the apps asks us instead of OpenStreetMap directly, so each lookup is identified (their usage policy
 * asks for that), remembered for a day, and a failure is just "nothing found", never an error.
 */
export interface ReverseResult {
  found: boolean;
  city?: string;
  state?: string;
  pincode?: string;
  /** House number and road, for the first address line. */
  line1?: string;
  /** Neighbourhood / locality, for the second address line. */
  area?: string;
}

const TTL_MS = 24 * 60 * 60 * 1000;
const MAX_ENTRIES = 5000;
const cache = new Map<string, { at: number; value: ReverseResult }>();

/** ~11 m cells, so two phones at the same door share one lookup. */
const keyOf = (lat: number, lng: number) => `${lat.toFixed(4)},${lng.toFixed(4)}`;

export async function reverseGeocode(lat: number, lng: number): Promise<ReverseResult> {
  const key = keyOf(lat, lng);
  const hit = cache.get(key);
  if (hit && Date.now() - hit.at < TTL_MS) return hit.value;

  let value: ReverseResult = { found: false };
  try {
    const r = await fetch(`https://nominatim.openstreetmap.org/reverse?format=jsonv2&addressdetails=1&zoom=18&lat=${lat}&lon=${lng}`, {
      headers: { 'User-Agent': 'AutozoApp/1.0 (address autofill)', 'Accept-Language': 'en' },
      signal: AbortSignal.timeout(6000),
    });
    if (r.ok) {
      const j = (await r.json()) as { address?: Record<string, string> };
      const a = j.address ?? {};
      const street = a.road || a.pedestrian || a.footway || a.residential || '';
      const line1 = [a.house_number, street].filter(Boolean).join(', ') || a.amenity || a.building || undefined;
      const city = a.city || a.town || a.village || a.municipality || a.county || a.state_district || undefined;
      const state = matchState(a.state) || a.state || undefined;
      const pincode = a.postcode?.replace(/\D/g, '').slice(0, 6) || undefined;
      const area = a.suburb || a.neighbourhood || a.city_district || a.hamlet || undefined;
      value = { found: !!(city || state || pincode), city, state, pincode, line1, area };
    }
  } catch {
    // OpenStreetMap down or slow: the form simply stays as it was. Not cached, so the next tap tries again.
    return value;
  }
  if (value.found) {
    if (cache.size >= MAX_ENTRIES) cache.delete(cache.keys().next().value as string);
    cache.set(key, { at: Date.now(), value });
  }
  return value;
}
