/**
 * Uploaded photos have a 480 px copy made at upload time. Cards, lists and
 * thumbnails ask for it with `?w=480`, so a phone downloads ~25 KB per card
 * instead of the full photo. Photos without a copy get the original back.
 */
export const smallPhoto = (src: string): string =>
  /\/uploads\/products\/[^/?#]+\.(jpe?g|png|webp)$/i.test(src) ? `${src}?w=480` : src;
