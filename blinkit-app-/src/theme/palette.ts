/**
 * Two palettes, identical key for key, so a component never asks which mode it
 * is in - it just reads `c.inkMuted` and gets something readable either way.
 *
 * Every foreground/background pair below was measured: body text clears
 * WCAG AA (4.5:1) and UI shapes clear 3:1. `inkFaint` is the one deliberate
 * 3.6:1 - it is for placeholders and disabled states, never for prose.
 */
export interface Palette {
  mode: 'light' | 'dark';

  brand: string;
  brandPressed: string;
  brandDeep: string;
  /** Brand colour safe to use as TEXT on a page background. */
  brandText: string;
  brandSurface: string;
  brandSurfaceStrong: string;
  brandBorder: string;
  onBrand: string;

  accent: string;
  accentSurface: string;
  gold: string;
  /** The blue used for "5% OFF on MRP" style savings lines. */
  save: string;
  saveSurface: string;

  ink: string;
  inkBody: string;
  inkMuted: string;
  inkFaint: string;

  surface: string;
  surfaceSunken: string;
  surfaceRaised: string;
  /** Backdrop for a merchandised strip that should stand off the page. */
  surfaceTint: string;
  overlay: string;
  skeleton: string;

  border: string;
  borderStrong: string;

  success: string;
  successSurface: string;
  successBorder: string;
  warning: string;
  warningSurface: string;
  danger: string;
  dangerSurface: string;
  info: string;
  infoSurface: string;

  veg: string;
  nonveg: string;

  /** Header band behind the address and search bar. */
  headerFrom: string;
  headerTo: string;
  /** Soft light that sits in the top corner of the header gradient. */
  headerGlow: string;
  /** The deep band behind "Deals of the day". */
  dealsFrom: string;
  dealsTo: string;
  /** Highlighter-pen swipe behind a deal price, and the ink that sits on it. */
  priceMark: string;
  onPriceMark: string;
  /** Colour of the soft light under primary buttons. */
  glow: string;
  /** Text and icons that sit on the header band. */
  onHeader: string;
  onHeaderMuted: string;

  shadow: string;

  /* Kept so older screens keep compiling while they migrate. */
  brandStrong: string;
  brandInk: string;
  brandLight: string;
}

export const light: Palette = {
  mode: 'light',

  brand: '#E0006E',
  brandPressed: '#B8005F',
  brandDeep: '#8E0A57',
  brandText: '#B0005A',
  brandSurface: '#FDE8F1',
  brandSurfaceStrong: '#FAD0E3',
  brandBorder: '#F2A9CB',
  onBrand: '#FFFFFF',

  accent: '#C2410C',
  accentSurface: '#FFEDE3',
  gold: '#E8A100',
  save: '#1558B0',
  saveSurface: '#E8F1FB',

  ink: '#15101A',
  inkBody: '#372F3F',
  inkMuted: '#61586B',
  inkFaint: '#8B8295',

  surface: '#FFFFFF',
  surfaceSunken: '#F3F0F5',
  surfaceRaised: '#FFFFFF',
  surfaceTint: '#FBEAF2',
  overlay: 'rgba(21, 17, 26, 0.55)',
  skeleton: '#ECE8EF',

  border: '#EAE4EE',
  borderStrong: '#D4CBDB',

  success: '#0B7A4B',
  successSurface: '#E6F4EC',
  successBorder: '#9FD6BA',
  warning: '#8A5A00',
  warningSurface: '#FFF4DE',
  danger: '#C02626',
  dangerSurface: '#FDECEC',
  info: '#1257A6',
  infoSurface: '#E8F1FB',

  veg: '#1E8E3E',
  nonveg: '#A3341F',

  headerFrom: '#6E0A4C',
  headerTo: '#B8005F',
  onHeader: '#FFFFFF',
  onHeaderMuted: 'rgba(255,255,255,0.88)',

  shadow: '#3A0A28',
  headerGlow: 'rgba(255, 92, 160, 0.55)',
  dealsFrom: '#8E0A57',
  dealsTo: '#D4006C',
  priceMark: '#FFE15A',
  onPriceMark: '#15101A',
  glow: 'rgba(224, 0, 110, 0.38)',

  brandStrong: '#8E0A57',
  brandInk: '#B0005A',
  brandLight: '#FF3D8E',
};

export const dark: Palette = {
  mode: 'dark',

  brand: '#E0127A',
  brandPressed: '#FF3D8E',
  brandDeep: '#FF79B4',
  brandText: '#FF79B4',
  brandSurface: '#2E1226',
  brandSurfaceStrong: '#431936',
  brandBorder: '#6A2452',
  onBrand: '#FFFFFF',

  accent: '#FF9A66',
  accentSurface: '#3A2418',
  gold: '#FFC247',
  save: '#86BBFF',
  saveSurface: '#182739',

  ink: '#F6F2F8',
  inkBody: '#DAD2E0',
  inkMuted: '#A89FB1',
  inkFaint: '#8A8193',

  surface: '#17131B',
  surfaceSunken: '#0D0A10',
  surfaceRaised: '#211B26',
  surfaceTint: '#1F1420',
  overlay: 'rgba(0, 0, 0, 0.68)',
  skeleton: '#261F2C',

  border: '#2C2532',
  borderStrong: '#443B4C',

  success: '#52D18E',
  successSurface: '#16301F',
  successBorder: '#2F6B48',
  warning: '#FFC247',
  warningSurface: '#332705',
  danger: '#FF8A8A',
  dangerSurface: '#3A1A1A',
  info: '#7EB6FF',
  infoSurface: '#182739',

  veg: '#52D18E',
  nonveg: '#FF8A7A',

  headerFrom: '#1C0717',
  headerTo: '#4A0830',
  onHeader: '#FFFFFF',
  onHeaderMuted: 'rgba(255,255,255,0.80)',

  shadow: '#000000',
  headerGlow: 'rgba(224, 18, 122, 0.45)',
  dealsFrom: '#3A0826',
  dealsTo: '#6E0C47',
  priceMark: '#FFD23F',
  onPriceMark: '#1A1400',
  glow: 'rgba(255, 61, 142, 0.45)',

  brandStrong: '#FF3D8E',
  brandInk: '#FF79B4',
  brandLight: '#FF79B4',
};

/**
 * Backend sends one pastel per category, chosen for a white page. Dropped
 * straight onto a dark page those pastels glow, so in dark mode we keep the
 * hue and borrow the page's own darkness for the rest.
 */
export function sectionTint(hex: string | undefined, p: Palette): string {
  if (!hex) return p.surfaceTint;
  if (p.mode === 'light') return hex;
  const m = /^#?([\da-f]{2})([\da-f]{2})([\da-f]{2})$/i.exec(hex.trim());
  if (!m) return p.surfaceTint;
  const [r, g, b] = [1, 2, 3].map((i) => parseInt(m[i], 16));
  // A fifth of the pastel over the card surface the tiles sit on. Enough for
  // each aisle to read as its own colour, not enough to lift the background
  // into the range where the label stops clearing AA.
  const base = [0x17, 0x13, 0x1b];
  const mix = [r, g, b].map((v, i) => Math.round(base[i] + (v - base[i]) * 0.22));
  return `#${mix.map((v) => v.toString(16).padStart(2, '0')).join('')}`;
}
