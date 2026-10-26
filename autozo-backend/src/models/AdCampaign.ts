import { Schema, model } from 'mongoose';

/**
 * A paid advertisement for a third party, shown on the customer website.
 *
 * Unlike a {@link Banner} (which links to one of our own categories), an ad
 * campaign points at an external `targetUrl` and belongs to an `advertiser`.
 * `placement` says where on the site it appears; `startAt`/`endAt` let a
 * campaign be scheduled, and `impressions`/`clicks` track how it performed.
 */
export const AD_PLACEMENTS = ['home_top', 'home_mid', 'home_bottom', 'category', 'sidebar'] as const;
export type AdPlacement = (typeof AD_PLACEMENTS)[number];

export interface IAdCampaign {
  advertiser: string;
  title: string;
  image: string;
  targetUrl: string;
  placement: AdPlacement;
  startAt?: Date | null;
  endAt?: Date | null;
  sortOrder: number;
  isActive: boolean;
  impressions: number;
  clicks: number;
  createdAt: Date;
  updatedAt: Date;
}

const adCampaignSchema = new Schema<IAdCampaign>(
  {
    advertiser: { type: String, required: true, trim: true, maxlength: 120 },
    title: { type: String, required: true, trim: true, maxlength: 140 },
    image: { type: String, required: true, trim: true },
    targetUrl: { type: String, required: true, trim: true },
    placement: { type: String, enum: AD_PLACEMENTS, default: 'home_mid', index: true },
    startAt: { type: Date, default: null },
    endAt: { type: Date, default: null },
    sortOrder: { type: Number, default: 0 },
    isActive: { type: Boolean, default: true, index: true },
    impressions: { type: Number, default: 0 },
    clicks: { type: Number, default: 0 },
  },
  { timestamps: true },
);

adCampaignSchema.index({ placement: 1, isActive: 1, sortOrder: 1 });

export const AdCampaign = model<IAdCampaign>('AdCampaign', adCampaignSchema);

/** A campaign is live when active and within its (optional) scheduling window. */
export function isAdLive(ad: Pick<IAdCampaign, 'isActive' | 'startAt' | 'endAt'>, now = new Date()): boolean {
  if (!ad.isActive) return false;
  if (ad.startAt && now < new Date(ad.startAt)) return false;
  if (ad.endAt && now > new Date(ad.endAt)) return false;
  return true;
}
