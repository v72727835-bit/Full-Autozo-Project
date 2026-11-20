/**
 * The super admin picks two colours (brand and accent, optionally a dark-mode brand). Everything
 * else - hover, tints, readable text, the dark-mode variants - is worked out here, once, so the
 * website, the admin panel and every app paint the same colours and none of them repeats the maths.
 */

export interface ThemeTokens {
  brand: string;
  brandHover: string;
  brandPress: string;
  brandDeep: string;
  /** Text/icons that sit on a brand-coloured button. */
  brandInk: string;
  brandTint: string;
  brandTint2: string;
  brandLine: string;
  /** Brand colour that is safe to use as TEXT on a page/tint background. */
  brandText: string;
  accent: string;
  accentDeep: string;
  accentInk: string;
  accentTint: string;
  accentLine: string;
  /** The header bar: a gradient from `barFrom` to `barTo`, with `barInk` text on it. */
  barFrom: string;
  barTo: string;
  barInk: string;
}

export interface ThemeSource {
  brand: string;
  accent: string;
  darkBrand?: string;
}

export interface PublicTheme {
  source: { brand: string; accent: string; darkBrand: string | null };
  light: ThemeTokens;
  dark: ThemeTokens;
}

export const DEFAULT_BRAND = '#0e8a3e';
export const DEFAULT_ACCENT = '#ffd23f';

const HEX = /^#[0-9a-fA-F]{6}$/;
export const isHex = (v: unknown): v is string => typeof v === 'string' && HEX.test(v);

type Rgb = [number, number, number];
const toRgb = (hex: string): Rgb => [1, 3, 5].map((i) => parseInt(hex.slice(i, i + 2), 16)) as Rgb;
const toHex = ([r, g, b]: Rgb) => '#' + [r, g, b].map((v) => Math.round(Math.min(255, Math.max(0, v))).toString(16).padStart(2, '0')).join('');

/** `amount` (0-1) of `with` mixed into `hex`. */
const mix = (hex: string, withHex: string, amount: number): string => {
  const a = toRgb(hex);
  const b = toRgb(withHex);
  return toHex(a.map((v, i) => v + (b[i] - v) * amount) as Rgb);
};
const lighten = (hex: string, amount: number) => mix(hex, '#ffffff', amount);
const darken = (hex: string, amount: number) => mix(hex, '#000000', amount);

const channel = (v: number) => {
  const s = v / 255;
  return s <= 0.03928 ? s / 12.92 : ((s + 0.055) / 1.055) ** 2.4;
};
const luminance = (hex: string) => {
  const [r, g, b] = toRgb(hex);
  return 0.2126 * channel(r) + 0.7152 * channel(g) + 0.0722 * channel(b);
};

/** WCAG contrast ratio between two colours (1 to 21). */
export function contrast(a: string, b: string): number {
  const la = luminance(a);
  const lb = luminance(b);
  return (Math.max(la, lb) + 0.05) / (Math.min(la, lb) + 0.05);
}

const WHITE = '#ffffff';
const NEAR_BLACK = '#111111';
/** Whichever of white or near-black reads better on `bg`. */
const inkOn = (bg: string) => (contrast(WHITE, bg) >= contrast(NEAR_BLACK, bg) ? WHITE : NEAR_BLACK);

/** Moves `hex` toward `toward` in small steps until it reads at 4.5:1 on `bg` (or runs out of room). */
function readableOn(hex: string, bg: string, toward: string): string {
  let out = hex;
  for (let i = 0; i <= 20 && contrast(out, bg) < 4.5; i++) out = mix(hex, toward, (i + 1) * 0.05);
  return out;
}

const DARK_PAGE = '#101611';
const DARK_TINT_BASE = '#0f1a13';

/** All the colours a client needs, for light and dark mode, from the two (or three) picked ones. */
export function deriveTokens(source: ThemeSource): { light: ThemeTokens; dark: ThemeTokens } {
  for (const v of [source.brand, source.accent]) if (!isHex(v)) throw new Error(`Not a #RRGGBB colour: ${String(v)}`);
  if (source.darkBrand !== undefined && !isHex(source.darkBrand)) throw new Error(`Not a #RRGGBB colour: ${String(source.darkBrand)}`);
  const brand = source.brand.toLowerCase();
  const accent = source.accent.toLowerCase();

  const brandTint = lighten(brand, 0.92);
  const light: ThemeTokens = {
    brand,
    brandHover: darken(brand, 0.12),
    brandPress: darken(brand, 0.24),
    brandDeep: darken(brand, 0.42),
    brandInk: inkOn(brand),
    brandTint,
    brandTint2: lighten(brand, 0.82),
    brandLine: lighten(brand, 0.6),
    brandText: readableOn(brand, brandTint, '#000000'),
    accent,
    accentDeep: darken(accent, 0.1),
    accentInk: inkOn(accent),
    accentTint: lighten(accent, 0.85),
    accentLine: lighten(accent, 0.55),
    barFrom: lighten(accent, 0.08),
    barTo: darken(accent, 0.04),
    barInk: NEAR_BLACK,
  };
  // The header text must read at both ends of the bar, whatever the accent is.
  const barInk = inkOn(contrast(WHITE, light.barFrom) < contrast(WHITE, light.barTo) ? light.barFrom : light.barTo);
  light.barInk = [light.barFrom, light.barTo].every((c) => contrast(barInk, c) >= 4.5) ? barInk : inkOn(accent);

  // Dark mode: a dark brand is lifted until it reads on a dark page, unless the admin chose one.
  const darkBrand = source.darkBrand ? source.darkBrand.toLowerCase() : readableOn(brand, DARK_PAGE, WHITE);
  const darkTint = mix(darkBrand, DARK_TINT_BASE, 0.88);
  const dark: ThemeTokens = {
    brand: darkBrand,
    brandHover: lighten(darkBrand, 0.12),
    brandPress: lighten(darkBrand, 0.24),
    brandDeep: darken(darkBrand, 0.3),
    brandInk: inkOn(darkBrand),
    brandTint: darkTint,
    brandTint2: mix(darkBrand, DARK_TINT_BASE, 0.8),
    brandLine: mix(darkBrand, DARK_TINT_BASE, 0.6),
    brandText: readableOn(lighten(darkBrand, 0.2), darkTint, WHITE),
    accent,
    accentDeep: darken(accent, 0.1),
    accentInk: inkOn(accent),
    accentTint: mix(accent, DARK_TINT_BASE, 0.88),
    accentLine: mix(accent, DARK_TINT_BASE, 0.7),
    barFrom: darken(accent, 0.55),
    barTo: darken(accent, 0.7),
    barInk: WHITE,
  };
  return { light, dark };
}

/**
 * What `/settings/public` publishes. Anything missing or not a valid colour falls back to the
 * built-in default, so one bad value can never break a client; with nothing valid saved it is
 * `null` and every client keeps its own built-in colours.
 */
export function buildPublicTheme(saved: { brand?: string; accent?: string; darkBrand?: string } | null | undefined): PublicTheme | null {
  const brand = isHex(saved?.brand) ? saved!.brand!.toLowerCase() : null;
  const accent = isHex(saved?.accent) ? saved!.accent!.toLowerCase() : null;
  if (!brand && !accent) return null;
  const darkBrand = isHex(saved?.darkBrand) ? saved!.darkBrand!.toLowerCase() : null;
  const source = { brand: brand ?? DEFAULT_BRAND, accent: accent ?? DEFAULT_ACCENT };
  const { light, dark } = deriveTokens({ ...source, ...(darkBrand ? { darkBrand } : {}) });
  return { source: { ...source, darkBrand }, light, dark };
}
