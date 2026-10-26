import { AD_PLACEMENTS, AdCampaign, AdPlacement, IAdCampaign, isAdLive } from '../models/AdCampaign';
import { FilterQuery } from 'mongoose';
import { ApiError } from '../utils/ApiError';
import { asyncHandler } from '../utils/asyncHandler';
import { escapeRegex } from '../utils/helpers';
import { created, ok, pageMeta } from '../utils/response';

/* ============ Public: ads shown on the website ============ */

/** Live campaigns for a placement, newest sort first. Counts an impression per ad returned. */
export const listPublicAds = asyncHandler(async (req, res) => {
  const { placement } = req.query as { placement?: AdPlacement };
  const filter: FilterQuery<IAdCampaign> = { isActive: true };
  if (placement) filter.placement = placement;
  const now = new Date();
  // Keep the DB filter loose and apply the scheduling window in code (null dates = always).
  const ads = (await AdCampaign.find(filter).sort({ sortOrder: 1, createdAt: -1 }).limit(20).lean()).filter((a) => isAdLive(a, now));

  if (ads.length) {
    AdCampaign.updateMany({ _id: { $in: ads.map((a) => a._id) } }, { $inc: { impressions: 1 } }).catch(() => undefined);
  }
  ok(
    res,
    ads.map((a) => ({ id: String(a._id), title: a.title, image: a.image, targetUrl: a.targetUrl, placement: a.placement })),
  );
});

/** Records a click and hands back the destination so the site can open it. */
export const clickAd = asyncHandler(async (req, res) => {
  const ad = await AdCampaign.findOneAndUpdate({ _id: req.params.id, isActive: true }, { $inc: { clicks: 1 } }, { new: true }).lean();
  if (!ad) throw new ApiError(404, 'Ad not found');
  ok(res, { targetUrl: ad.targetUrl });
});

/* ============ Admin: manage campaigns ============ */

export const listAdsAdmin = asyncHandler(async (req, res) => {
  const { q, placement, isActive, page, limit } = req.query as unknown as {
    q?: string;
    placement?: AdPlacement;
    isActive?: boolean;
    page: number;
    limit: number;
  };
  const filter: FilterQuery<IAdCampaign> = {};
  if (q) {
    const rx = { $regex: escapeRegex(q), $options: 'i' };
    filter.$or = [{ title: rx }, { advertiser: rx }];
  }
  if (placement) filter.placement = placement;
  if (isActive !== undefined) filter.isActive = isActive;

  const [ads, total] = await Promise.all([
    AdCampaign.find(filter).sort({ sortOrder: 1, createdAt: -1 }).skip((page - 1) * limit).limit(limit).lean(),
    AdCampaign.countDocuments(filter),
  ]);
  ok(res, ads, pageMeta(page, limit, total));
});

export const createAd = asyncHandler(async (req, res) => {
  const ad = await AdCampaign.create(req.body as Partial<IAdCampaign>);
  created(res, ad);
});

export const updateAd = asyncHandler(async (req, res) => {
  const ad = await AdCampaign.findByIdAndUpdate(req.params.id, req.body as Partial<IAdCampaign>, { new: true, runValidators: true });
  if (!ad) throw new ApiError(404, 'Ad not found');
  ok(res, ad);
});

export const deleteAd = asyncHandler(async (req, res) => {
  const ad = await AdCampaign.findByIdAndDelete(req.params.id);
  if (!ad) throw new ApiError(404, 'Ad not found');
  ok(res, { message: 'Ad deleted' });
});

export { AD_PLACEMENTS };
