import { Schema, model } from 'mongoose';

/**
 * A content page written in the admin panel and shown on the website — e.g.
 * "Terms & Conditions", "Privacy Policy", "About us".
 *
 * The body is an ordered list of blocks so a page can mix headings, paragraphs
 * of text and images in any order. `slug` is the address it is served at
 * (`/p/<slug>` on the website); a few slugs like `terms` and `privacy` are
 * linked from the footer. Only `isPublished` pages are visible to customers.
 */
export const PAGE_BLOCK_TYPES = ['heading', 'text', 'image'] as const;
export type PageBlockType = (typeof PAGE_BLOCK_TYPES)[number];

export interface IPageBlock {
  type: PageBlockType;
  /** For `heading` and `text` blocks. */
  text?: string;
  /** For `image` blocks: the uploaded image URL and its alt text. */
  image?: string;
  alt?: string;
}

export interface IPage {
  slug: string;
  title: string;
  blocks: IPageBlock[];
  metaDescription?: string;
  isPublished: boolean;
  createdAt: Date;
  updatedAt: Date;
}

const pageBlockSchema = new Schema<IPageBlock>(
  {
    type: { type: String, enum: PAGE_BLOCK_TYPES, required: true },
    text: { type: String, trim: true },
    image: { type: String, trim: true },
    alt: { type: String, trim: true },
  },
  { _id: false },
);

const pageSchema = new Schema<IPage>(
  {
    slug: { type: String, required: true, unique: true, trim: true, lowercase: true, maxlength: 80 },
    title: { type: String, required: true, trim: true, maxlength: 140 },
    blocks: { type: [pageBlockSchema], default: [] },
    metaDescription: { type: String, trim: true, maxlength: 300 },
    isPublished: { type: Boolean, default: true, index: true },
  },
  { timestamps: true },
);

export const Page = model<IPage>('Page', pageSchema);
