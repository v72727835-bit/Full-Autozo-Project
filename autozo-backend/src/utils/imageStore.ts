import mongoose from 'mongoose';

/**
 * Uploaded images live in MongoDB (GridFS), not on the server's disk.
 *
 * The host's disk is wiped on every deploy and restart, so files written
 * there vanished and left broken images across the app. The database
 * survives deploys, so images stored in it do too.
 *
 * Every image can also have a small copy (THUMB_WIDTH px wide) stored next to
 * it as "<name>__w480". The panels make it in the browser at upload time;
 * product cards ask for it with `?w=480` so a phone downloads ~25 KB per card
 * instead of the full photo.
 */
const bucket = () => {
  const db = mongoose.connection.db;
  if (!db) throw new Error('Database is not connected');
  return new mongoose.mongo.GridFSBucket(db, { bucketName: 'uploads' });
};

export const THUMB_WIDTH = 480;
export const thumbName = (name: string) => `${name}__w${THUMB_WIDTH}`;
export const isThumbName = (name: string) => /__w\d+$/.test(name);

/* ---------- in-memory caches ----------
   Every image request used to cost a GridFS lookup plus a chunk read. File
   records are cached so the lookup is skipped, and small files (thumbnails,
   icons) are kept whole in memory so hot product cards never touch MongoDB. */
type FileInfo = { id: mongoose.Types.ObjectId; length: number; contentType: string };
const INFO_MAX = 5_000;
const MISS_TTL_MS = 60_000;
const BODY_MAX_FILE = 96 * 1024;
const BODY_MAX_TOTAL = 24 * 1024 * 1024;
const infos = new Map<string, FileInfo>();
const misses = new Map<string, number>();
const bodies = new Map<string, Buffer>();
let bodyBytes = 0;

function remember(name: string, info: FileInfo) {
  if (infos.size >= INFO_MAX) infos.delete(infos.keys().next().value as string);
  infos.set(name, info);
}

function rememberBody(name: string, data: Buffer) {
  if (data.length > BODY_MAX_FILE) return;
  while (bodies.size && bodyBytes + data.length > BODY_MAX_TOTAL) {
    const oldest = bodies.keys().next().value as string;
    bodyBytes -= bodies.get(oldest)!.length;
    bodies.delete(oldest);
  }
  bodies.set(name, data);
  bodyBytes += data.length;
}

function forget(name: string) {
  infos.delete(name);
  misses.delete(name);
  const body = bodies.get(name);
  if (body) {
    bodyBytes -= body.length;
    bodies.delete(name);
  }
}

export function saveImage(filename: string, contentType: string, data: Buffer): Promise<void> {
  forget(filename);
  return new Promise((resolve, reject) => {
    bucket()
      .openUploadStream(filename, { metadata: { contentType } })
      .on('error', reject)
      .on('finish', () => {
        forget(filename);
        resolve();
      })
      .end(data);
  });
}

/** Writes (or replaces) the small copy of an image. */
export async function saveThumb(name: string, contentType: string, data: Buffer): Promise<void> {
  const target = thumbName(name);
  const old = await bucket().find({ filename: target }).toArray();
  await saveImage(target, contentType, data);
  // Old copies go only after the new one is safely stored.
  for (const file of old) await bucket().delete(file._id).catch(() => undefined);
  forget(target);
}

async function lookup(filename: string): Promise<FileInfo | null> {
  const known = infos.get(filename);
  if (known) return known;
  const missedAt = misses.get(filename);
  if (missedAt && Date.now() - missedAt < MISS_TTL_MS) return null;
  const [file] = await bucket().find({ filename }).sort({ uploadDate: -1 }).limit(1).toArray();
  if (!file) {
    if (misses.size >= INFO_MAX) misses.delete(misses.keys().next().value as string);
    misses.set(filename, Date.now());
    return null;
  }
  const info = {
    id: file._id,
    length: file.length,
    contentType: (file.metadata?.contentType as string | undefined) ?? 'application/octet-stream',
  };
  remember(filename, info);
  return info;
}

export async function findImage(filename: string) {
  const info = await lookup(filename);
  if (!info) return null;
  const cached = bodies.get(filename);
  return {
    contentType: info.contentType,
    length: info.length,
    /** The whole file, when it is small enough to be kept in memory. */
    async buffer(): Promise<Buffer | null> {
      if (cached) return cached;
      if (info.length > BODY_MAX_FILE) return null;
      const parts: Buffer[] = [];
      for await (const chunk of bucket().openDownloadStream(info.id)) parts.push(chunk as Buffer);
      const data = Buffer.concat(parts);
      rememberBody(filename, data);
      return data;
    },
    open: (range?: { start: number; end: number }) =>
      bucket().openDownloadStream(info.id, range ? { start: range.start, end: range.end + 1 } : undefined),
  };
}

/** Uploaded photos that have no small copy yet, oldest first, for the panel's one-time "speed up old photos" job. */
export async function listImagesWithoutThumb(after: string | undefined, limit: number) {
  const filter: Record<string, unknown> = {
    'metadata.contentType': { $in: ['image/jpeg', 'image/png', 'image/webp'] },
    filename: { $not: /__w\d+$/ },
  };
  if (after && mongoose.isValidObjectId(after)) filter._id = { $gt: new mongoose.Types.ObjectId(after) };
  const files = await bucket().find(filter).sort({ _id: 1 }).limit(limit).toArray();
  const thumbs = await bucket()
    .find({ filename: { $in: files.map((f) => thumbName(f.filename)) } })
    .project({ filename: 1 })
    .toArray();
  const have = new Set(thumbs.map((t) => t.filename as string));
  return {
    items: files.filter((f) => !have.has(thumbName(f.filename))).map((f) => ({ name: f.filename, length: f.length })),
    next: files.length === limit ? String(files[files.length - 1]._id) : null,
  };
}
