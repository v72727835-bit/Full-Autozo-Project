import { IPage, Page } from '../models/Page';
import { ApiError } from '../utils/ApiError';
import { asyncHandler } from '../utils/asyncHandler';
import { created, ok } from '../utils/response';

/* ============ Public: read a content page ============ */

export const getPublicPage = asyncHandler(async (req, res) => {
  const page = await Page.findOne({ slug: String(req.params.slug).toLowerCase(), isPublished: true })
    .select('slug title blocks metaDescription updatedAt')
    .lean();
  if (!page) throw new ApiError(404, 'Page not found');
  ok(res, page);
});

/* ============ Admin: manage content pages ============ */

export const listPagesAdmin = asyncHandler(async (_req, res) => {
  const pages = await Page.find({}).sort({ title: 1 }).select('slug title isPublished updatedAt').lean();
  ok(res, pages);
});

export const getPageAdmin = asyncHandler(async (req, res) => {
  const page = await Page.findById(req.params.id).lean();
  if (!page) throw new ApiError(404, 'Page not found');
  ok(res, page);
});

export const createPage = asyncHandler(async (req, res) => {
  const body = req.body as Partial<IPage> & { slug: string };
  if (await Page.exists({ slug: body.slug.toLowerCase() })) throw new ApiError(409, 'A page with that address (slug) already exists');
  const page = await Page.create(body);
  created(res, page);
});

export const updatePage = asyncHandler(async (req, res) => {
  const body = req.body as Partial<IPage>;
  if (body.slug) {
    const clash = await Page.findOne({ slug: body.slug.toLowerCase(), _id: { $ne: req.params.id } }).select('_id').lean();
    if (clash) throw new ApiError(409, 'A page with that address (slug) already exists');
  }
  const page = await Page.findByIdAndUpdate(req.params.id, body, { new: true, runValidators: true });
  if (!page) throw new ApiError(404, 'Page not found');
  ok(res, page);
});

export const deletePage = asyncHandler(async (req, res) => {
  const page = await Page.findByIdAndDelete(req.params.id);
  if (!page) throw new ApiError(404, 'Page not found');
  ok(res, { message: 'Page deleted' });
});
