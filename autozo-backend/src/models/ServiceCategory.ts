import { Schema, model } from 'mongoose';
import { uniqueSlug } from '../utils/helpers';

/** A top-level grouping shown on the public Services page (e.g. "Car wash", "Plumbing"). */
export interface IServiceCategory {
  name: string;
  slug: string;
  description?: string;
  icon?: string;
  image?: string;
  isActive: boolean;
  sort: number;
}

const serviceCategorySchema = new Schema<IServiceCategory>(
  {
    name: { type: String, required: true, trim: true },
    slug: { type: String, unique: true, lowercase: true, trim: true },
    description: { type: String, trim: true },
    icon: String,
    image: String,
    isActive: { type: Boolean, default: true, index: true },
    sort: { type: Number, default: 1_000 },
  },
  { timestamps: true },
);

serviceCategorySchema.index({ isActive: 1, sort: 1 });

serviceCategorySchema.pre('validate', function (next) {
  if (!this.slug) this.slug = uniqueSlug(this.name);
  next();
});

export const ServiceCategory = model<IServiceCategory>('ServiceCategory', serviceCategorySchema);
