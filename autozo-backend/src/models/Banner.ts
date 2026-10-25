import { Schema, Types, model } from 'mongoose';

/**
 * A promo slide on the home page carousel, managed from the admin panel.
 *
 * `image` is the uploaded artwork and fills the whole slide. The text fields
 * are optional and only drawn over the image when set, so a fully designed
 * banner can be uploaded as-is. Tapping the slide opens `category`.
 *
 * `placement` picks where it shows: `top` slides make up the hero carousel,
 * `between` banners are spread out between the home page sections, `middle`
 * banners sit in the centre of the home page above a products row, and
 * `category` banners sit at the top of `category`'s own page (and its aisles).
 */
export const BANNER_PLACEMENTS = ['top', 'between', 'middle', 'category'] as const;
export type BannerPlacement = (typeof BANNER_PLACEMENTS)[number];

export interface IBanner {
  title?: string;
  subtitle?: string;
  cta?: string;
  image: string;
  category?: Types.ObjectId | null;
  placement: BannerPlacement;
  sortOrder: number;
  isActive: boolean;
}

const bannerSchema = new Schema<IBanner>(
  {
    title: { type: String, trim: true },
    subtitle: { type: String, trim: true },
    cta: { type: String, trim: true },
    image: { type: String, required: true, trim: true },
    category: { type: Schema.Types.ObjectId, ref: 'Category', default: null },
    placement: { type: String, enum: BANNER_PLACEMENTS, default: 'top' },
    sortOrder: { type: Number, default: 0 },
    isActive: { type: Boolean, default: true },
  },
  { timestamps: true },
);

bannerSchema.index({ isActive: 1, sortOrder: 1 });
bannerSchema.index({ placement: 1, category: 1 });

export const Banner = model<IBanner>('Banner', bannerSchema);
