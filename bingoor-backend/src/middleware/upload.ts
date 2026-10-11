import { randomUUID } from 'crypto';
import { RequestHandler } from 'express';
import multer from 'multer';
import { ApiError } from '../utils/ApiError';
import { saveImage } from '../utils/imageStore';

const extensionByMime: Record<string, string> = {
  'image/jpeg': '.jpg',
  'image/png': '.png',
  'image/webp': '.webp',
  'image/gif': '.gif',
};

const makeUploader = (maxBytes: number) => multer({
  // Kept in memory just long enough to be written to the database.
  storage: multer.memoryStorage(),
  limits: { fileSize: maxBytes, files: 10 },
  fileFilter: (_req, file, done) => {
    if (!extensionByMime[file.mimetype]) return done(new ApiError(400, 'Only JPEG, PNG, WebP and GIF images are allowed'));
    done(null, true);
  },
}).array('images', 10);

const uploader = makeUploader(5 * 1024 * 1024);
/** Sellers may upload at most 200 KB per image - the same cap the admin tips recommend. */
const sellerUploader = makeUploader(200 * 1024);

/** Gives each upload a fresh name and stores it in the database. */
async function persist(files: Express.Multer.File[]) {
  for (const file of files) {
    file.filename = `${randomUUID()}${extensionByMime[file.mimetype] ?? ''}`;
    await saveImage(file.filename, file.mimetype, file.buffer);
  }
}

const handler = (up: typeof uploader, limitMsg: string): RequestHandler => (req, res, next) => {
  up(req, res, (error) => {
    if (!error) {
      persist((req.files as Express.Multer.File[] | undefined) ?? []).then(() => next(), next);
      return;
    }
    if (error instanceof multer.MulterError) {
      if (error.code === 'LIMIT_FILE_SIZE') return next(new ApiError(400, limitMsg));
      if (error.code === 'LIMIT_FILE_COUNT') return next(new ApiError(400, 'You can upload at most 10 images at once'));
      return next(new ApiError(400, error.message));
    }
    next(error);
  });
};
export const uploadProductImages = handler(uploader, 'Each image must be 5 MB or smaller');
export const uploadSellerImages = handler(
  sellerUploader,
  'Each image must be 200 KB or smaller. Reduce it with a free image-size tool (for example "pi7 image tool") and upload again.',
);
