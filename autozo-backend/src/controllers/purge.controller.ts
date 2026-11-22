import { purgeCustomers } from '../services/purgeCustomers.service';
import { ApiError } from '../utils/ApiError';
import { asyncHandler } from '../utils/asyncHandler';
import { ok } from '../utils/response';

/** What "Delete all customers" would remove (nothing is deleted). */
export const previewCustomerPurge = asyncHandler(async (_req, res) => {
  ok(res, await purgeCustomers(true));
});

/** Deletes every customer and all their data. Super admin only, with the word DELETE typed in. */
export const purgeAllCustomers = asyncHandler(async (req, res) => {
  if ((req.body as { confirm?: unknown })?.confirm !== 'DELETE') throw new ApiError(400, 'Type DELETE to confirm.');
  ok(res, await purgeCustomers(false));
});
