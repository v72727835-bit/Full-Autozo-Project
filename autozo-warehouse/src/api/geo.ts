import { api } from './client';

/** What a pin turns into: city, state, PIN and address, from our /geo/reverse (nothing found = `found: false`). */
export interface PlaceDetails {
  found: boolean;
  city?: string;
  state?: string;
  pincode?: string;
  /** House number and road. */
  line1?: string;
  /** Neighbourhood / locality. */
  area?: string;
}

/** Never throws: a lookup that fails just leaves the form as it was. */
export async function reverseGeocode(lat: number, lng: number): Promise<PlaceDetails> {
  try {
    return (await api.get('/geo/reverse', { params: { lat, lng } })).data.data as PlaceDetails;
  } catch {
    return { found: false };
  }
}
