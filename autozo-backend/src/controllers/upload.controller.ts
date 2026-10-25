import { uploadedImages } from '../middleware/upload';
import { ApiError } from '../utils/ApiError';
import { findImage, isThumbName, listImagesWithoutThumb, saveThumb } from '../utils/imageStore';
import { asyncHandler } from '../utils/asyncHandler';
import { ok } from '../utils/response';

export const uploadImages = asyncHandler(async (req, res) => {
  const files = uploadedImages(req);
  if (!files.length) throw new ApiError(400, 'Select at least one image to upload');

  const forwardedProtocol = req.get('x-forwarded-proto')?.split(',')[0]?.trim();
  const baseUrl = `${forwardedProtocol || req.protocol}://${req.get('host')}`;
  const urls = files.map((file) => `${baseUrl}/uploads/products/${file.filename}`);

  ok(res, { urls });
});

export const uploadVideo = asyncHandler(async (req, res) => {
  const file = req.file;
  if (!file) throw new ApiError(400, 'Choose a video to upload');
  const forwardedProtocol = req.get('x-forwarded-proto')?.split(',')[0]?.trim();
  const baseUrl = `${forwardedProtocol || req.protocol}://${req.get('host')}`;
  ok(res, { url: `${baseUrl}/uploads/products/${file.filename}` });
});

/** Photos uploaded before small copies existed, a page at a time. */
export const listThumbless = asyncHandler(async (req, res) => {
  const after = typeof req.query.after === 'string' ? req.query.after : undefined;
  const forwardedProtocol = req.get('x-forwarded-proto')?.split(',')[0]?.trim();
  const baseUrl = `${forwardedProtocol || req.protocol}://${req.get('host')}`;
  const page = await listImagesWithoutThumb(after, 40);
  ok(res, { items: page.items.map((i) => ({ ...i, url: `${baseUrl}/uploads/products/${i.name}` })), next: page.next });
});

/** Stores the small copy the panel made of an older photo. */
export const saveOldThumb = asyncHandler(async (req, res) => {
  const name = String(req.params.name);
  if (!/^[\w-]+\.(jpg|png|webp|gif)$/i.test(name) || isThumbName(name)) throw new ApiError(400, 'Unknown photo');
  if (!req.file) throw new ApiError(400, 'Choose an image to upload');
  if (!(await findImage(name))) throw new ApiError(404, 'Photo not found');
  await saveThumb(name, req.file.mimetype, req.file.buffer);
  ok(res, { name });
});
