/**
 * Photos are shrunk in the browser before they are uploaded.
 *
 * A phone photo is 3-8 MB; resized to 1600 px and saved as WebP it is about
 * 100-200 KB and looks the same on a product page. That makes the upload many
 * times faster on a shop's mobile data and keeps the storefront light. A
 * 480 px copy is made at the same time for product cards and lists.
 */
export const THUMB_SIDE = 480;

export interface CompressOptions {
  /** Longest side of the full photo, in px. */
  maxSide?: number;
  /** Target size of the full photo; quality is lowered step by step to reach it. */
  maxBytes?: number;
}

export interface PreparedImage {
  file: File;
  thumb: File | null;
}

let webpOk: boolean | null = null;
/** Older Safari silently returns PNG when asked for WebP, so check once. */
function supportsWebp(): boolean {
  if (webpOk === null) {
    try {
      const c = document.createElement('canvas');
      c.width = c.height = 1;
      webpOk = c.toDataURL('image/webp').startsWith('data:image/webp');
    } catch {
      webpOk = false;
    }
  }
  return webpOk;
}

async function decode(file: Blob): Promise<ImageBitmap | HTMLImageElement> {
  if (typeof createImageBitmap === 'function') {
    try {
      // Respects the phone's EXIF rotation, so portrait photos stay upright.
      return await createImageBitmap(file, { imageOrientation: 'from-image' });
    } catch {
      /* fall back to <img> below */
    }
  }
  const url = URL.createObjectURL(file);
  try {
    const img = new Image();
    img.decoding = 'async';
    img.src = url;
    await img.decode();
    return img;
  } finally {
    URL.revokeObjectURL(url);
  }
}

function toBlob(canvas: HTMLCanvasElement, type: string, quality: number): Promise<Blob | null> {
  return new Promise((resolve) => canvas.toBlob(resolve, type, quality));
}

async function encode(source: ImageBitmap | HTMLImageElement, maxSide: number, maxBytes: number, keepAlpha: boolean): Promise<Blob | null> {
  const w0 = source.width;
  const h0 = source.height;
  const scale = Math.min(1, maxSide / Math.max(w0, h0));
  const canvas = document.createElement('canvas');
  canvas.width = Math.max(1, Math.round(w0 * scale));
  canvas.height = Math.max(1, Math.round(h0 * scale));
  const ctx = canvas.getContext('2d');
  if (!ctx) return null;
  const type = supportsWebp() ? 'image/webp' : 'image/jpeg';
  if (type === 'image/jpeg' && !keepAlpha) {
    ctx.fillStyle = '#fff';
    ctx.fillRect(0, 0, canvas.width, canvas.height);
  }
  ctx.imageSmoothingQuality = 'high';
  ctx.drawImage(source, 0, 0, canvas.width, canvas.height);
  let blob: Blob | null = null;
  for (const q of [0.82, 0.72, 0.62, 0.5, 0.4]) {
    blob = await toBlob(canvas, type, q);
    if (!blob || blob.size <= maxBytes) break;
  }
  return blob;
}

const renamed = (name: string, type: string) => name.replace(/\.[^.]+$/, '') + (type === 'image/webp' ? '.webp' : '.jpg');

/**
 * Returns a smaller copy of the photo plus a card-sized thumbnail. Animated
 * GIFs, and anything the browser cannot read, are sent unchanged.
 */
export async function prepareImage(file: File, opts: CompressOptions = {}): Promise<PreparedImage> {
  const maxSide = opts.maxSide ?? 1600;
  const maxBytes = opts.maxBytes ?? 250 * 1024;
  if (!/^image\/(jpeg|png|webp)$/.test(file.type)) return { file, thumb: null };
  let source: ImageBitmap | HTMLImageElement;
  try {
    source = await decode(file);
  } catch {
    return { file, thumb: null };
  }
  try {
    const keepAlpha = file.type !== 'image/jpeg';
    // Very detailed photos may still be too big at the lowest quality: step the size down too.
    let big: Blob | null = null;
    for (let side = maxSide; side >= 600; side = Math.round(side * 0.75)) {
      big = await encode(source, side, maxBytes, keepAlpha);
      if (!big || big.size <= maxBytes) break;
    }
    const small = await encode(source, THUMB_SIDE, 40 * 1024, keepAlpha);
    // Keep the original when it was already smaller (an optimised PNG logo, say).
    const full = big && (big.size < file.size || Math.max(source.width, source.height) > maxSide)
      ? new File([big], renamed(file.name, big.type), { type: big.type })
      : file;
    const thumb = small && small.size < full.size ? new File([small], renamed(file.name, small.type), { type: small.type }) : null;
    return { file: full, thumb };
  } finally {
    if ('close' in source) source.close();
  }
}

/** Runs `task` over `items` with at most `limit` running at once. */
export async function runLimited<T, R>(items: T[], limit: number, task: (item: T, index: number) => Promise<R>): Promise<R[]> {
  const results = new Array<R>(items.length);
  let next = 0;
  const worker = async () => {
    while (next < items.length) {
      const i = next++;
      results[i] = await task(items[i], i);
    }
  };
  await Promise.all(Array.from({ length: Math.min(limit, items.length) }, worker));
  return results;
}

/** Just the card-sized copy of a photo (for photos uploaded before copies were made). */
export async function makeThumb(blob: Blob, name: string): Promise<File | null> {
  const source = await decode(blob).catch(() => null);
  if (!source) return null;
  try {
    const small = await encode(source, THUMB_SIDE, 40 * 1024, true);
    return small ? new File([small], renamed(name, small.type), { type: small.type }) : null;
  } finally {
    if ('close' in source) source.close();
  }
}
