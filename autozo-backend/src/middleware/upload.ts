import { randomUUID } from 'crypto';
import { RequestHandler } from 'express';
import multer from 'multer';
import { ApiError } from '../utils/ApiError';
import { saveImage, saveThumb } from '../utils/imageStore';

const extensionByMime: Record<string, string> = {
  'image/jpeg': '.jpg',
  'image/png': '.png',
  'image/webp': '.webp',
  'image/gif': '.gif',
};

const makeUploader = (maxBytes: number) => multer({
  // Kept in memory just long enough to be written to the database.
  storage: multer.memoryStorage(),
  limits: { fileSize: maxBytes, files: 20 },
  fileFilter: (_req, file, done) => {
    if (!extensionByMime[file.mimetype]) return done(new ApiError(400, 'Only JPEG, PNG, WebP and GIF images are allowed'));
    done(null, true);
  },
  // `thumbs[i]` is the small copy of `images[i]`, made by the panel in the browser.
}).fields([{ name: 'images', maxCount: 10 }, { name: 'thumbs', maxCount: 10 }]);

type UploadFields = { images?: Express.Multer.File[]; thumbs?: Express.Multer.File[] };
/** The uploaded full-size images (the small copies are stored alongside them). */
export const uploadedImages = (req: { files?: unknown }) => (req.files as UploadFields | undefined)?.images ?? [];

const uploader = makeUploader(5 * 1024 * 1024);
/** Sellers may upload at most 200 KB per image - the same cap the admin tips recommend. */
const sellerUploader = makeUploader(200 * 1024);

/** Gives each upload a fresh name and stores it in the database. */
async function persist({ images = [], thumbs = [] }: UploadFields) {
  const paired = thumbs.length === images.length;
  await Promise.all(
    images.map(async (file, i) => {
      file.filename = `${randomUUID()}${extensionByMime[file.mimetype] ?? ''}`;
      await saveImage(file.filename, file.mimetype, file.buffer);
      if (paired) await saveThumb(file.filename, thumbs[i].mimetype, thumbs[i].buffer);
    }),
  );
}

const handler = (up: typeof uploader, limitMsg: string): RequestHandler => (req, res, next) => {
  up(req, res, (error) => {
    if (!error) {
      persist((req.files as UploadFields | undefined) ?? {}).then(() => next(), next);
      return;
    }
    if (error instanceof multer.MulterError) {
      if (error.code === 'LIMIT_FILE_SIZE') return next(new ApiError(400, limitMsg));
      if (error.code === 'LIMIT_FILE_COUNT' || error.code === 'LIMIT_UNEXPECTED_FILE') return next(new ApiError(400, 'You can upload at most 10 images at once'));
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

/* ---------------- product video ---------------- */

const videoExtensionByMime: Record<string, string> = {
  'video/mp4': '.mp4',
  'video/webm': '.webm',
};

const makeVideoUploader = (maxBytes: number) =>
  multer({
    storage: multer.memoryStorage(),
    limits: { fileSize: maxBytes, files: 1 },
    fileFilter: (_req, file, done) => {
      if (!videoExtensionByMime[file.mimetype]) return done(new ApiError(400, 'Only MP4 and WebM videos are allowed'));
      done(null, true);
    },
  }).single('video');

const videoHandler = (up: ReturnType<typeof makeVideoUploader>, limitMsg: string): RequestHandler => (req, res, next) => {
  up(req, res, (error) => {
    if (!error) {
      const file = req.file;
      if (!file) return next(new ApiError(400, 'Choose a video to upload'));
      file.filename = `${randomUUID()}${videoExtensionByMime[file.mimetype]}`;
      // Stored next to the images; the same route serves it, with range support so it can be played and skipped.
      saveImage(file.filename, file.mimetype, file.buffer).then(() => next(), next);
      return;
    }
    if (error instanceof multer.MulterError) {
      if (error.code === 'LIMIT_FILE_SIZE') return next(new ApiError(400, limitMsg));
      return next(new ApiError(400, error.message));
    }
    next(error);
  });
};

export const uploadProductVideo = videoHandler(makeVideoUploader(30 * 1024 * 1024), 'The video must be 30 MB or smaller. Shorten or compress it, or paste a YouTube link instead.');
export const uploadSellerVideo = videoHandler(makeVideoUploader(15 * 1024 * 1024), 'The video must be 15 MB or smaller. Shorten or compress it, or paste a YouTube link instead.');

/* ---------------- small copies of older photos ---------------- */

const thumbUploader = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 200 * 1024, files: 1 },
  fileFilter: (_req, file, done) => {
    if (!extensionByMime[file.mimetype]) return done(new ApiError(400, 'Only JPEG, PNG, WebP and GIF images are allowed'));
    done(null, true);
  },
}).single('thumb');

/** Parses the one small copy sent by the panel's "speed up old photos" job. */
export const uploadThumb: RequestHandler = (req, res, next) => {
  thumbUploader(req, res, (error) => {
    if (error instanceof multer.MulterError) return next(new ApiError(400, error.message));
    next(error);
  });
};
