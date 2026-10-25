import { Schema, Types, model } from 'mongoose';

/**
 * A promo slide on the home page carousel, managed from the admin panel.
 *
 * `image` is the uploaded artwork and fills the whole slide. The text fields
 * are optional and only drawn over the image when set, so a fully designed
 * banner can be uploaded as-is. Tapping the slide opens `category`.
 *
 * `placement` picks where it shows: `top` slides make up the hero carousel,
 * `between` banners are spread out between the home page sections.
 */
export interface IBanner {
  title?: string;
  subtitle?: string;
  cta?: string;
  image: string;
  category?: Types.ObjectId | null;
  placement: 'top' | 'between';
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
    placement: { type: String, enum: ['top', 'between'], default: 'top' },
    sortOrder: { type: Number, default: 0 },
    isActive: { type: Boolean, default: true },
  },
  { timestamps: true },
);

bannerSchema.index({ isActive: 1, sortOrder: 1 });

export const Banner = model<IBanner>('Banner', bannerSchema);
