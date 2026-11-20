import { countReferred, ensureReferralCode } from '../services/referral.service';
import { asyncHandler } from '../utils/asyncHandler';
import { ok } from '../utils/response';

/** My share code and how many people joined with it (any signed-in role). */
export const mine = asyncHandler(async (req, res) => {
  const id = req.user!.id;
  ok(res, { code: await ensureReferralCode(id), referred: await countReferred(id) });
});
