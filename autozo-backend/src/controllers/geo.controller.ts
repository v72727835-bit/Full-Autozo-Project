import { reverseGeocode } from '../services/geo.service';
import { asyncHandler } from '../utils/asyncHandler';
import { ok } from '../utils/response';

/** City, state, PIN and address for a pin, so a form can fill itself from "Use my current location". */
export const reverse = asyncHandler(async (req, res) => {
  const { lat, lng } = req.query as unknown as { lat: number; lng: number };
  ok(res, await reverseGeocode(lat, lng));
});
