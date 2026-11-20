import { API_URL } from './config';

/** The colours the super admin picked, already worked out for light and dark mode by the server. */
export interface ThemeTokens {
  brand: string; brandHover: string; brandPress: string; brandDeep: string; brandInk: string;
  brandTint: string; brandTint2: string; brandLine: string; brandText: string;
  accent: string; accentDeep: string; accentInk: string; accentTint: string; accentLine: string;
  barFrom: string; barTo: string; barInk: string;
}
export interface RemoteTheme {
  source: { brand: string; accent: string; darkBrand: string | null };
  light: ThemeTokens;
  dark: ThemeTokens;
}

/** The generated stylesheet is remembered so the next visit paints the colours before first render. */
export const BRAND_CSS_KEY = 'autozo_brand_css';
const STYLE_ID = 'autozo-brand';
const HEX = /^#[0-9a-fA-F]{6}$/;

function vars(t: ThemeTokens, dark: boolean): string {
  const tool = dark ? [10, 18, 18] : [8, 14, 16];
  return [
    `--brand:${t.brand}`, `--brand-hover:${t.brandHover}`, `--brand-press:${t.brandPress}`, `--brand-ink:${t.brandInk}`,
    `--plum:${t.brandDeep}`, `--plum-deep:color-mix(in srgb, ${t.brandDeep} 70%, #000)`,
    `--brand-tint:${t.brandTint}`, `--brand-tint-2:${t.brandTint2}`, `--brand-line:${t.brandLine}`, `--brand-text:${t.brandText}`,
    `--sun:${t.accent}`, `--sun-2:${t.accentDeep}`, `--sun-ink:${t.accentInk}`, `--sun-tint:${t.accentTint}`, `--sun-line:${t.accentLine}`,
    `--bar:linear-gradient(100deg, ${t.barFrom}, ${t.barTo})`, `--bar-ink:${t.barInk}`,
    `--bar-tool:color-mix(in srgb, ${t.barInk} ${tool[0]}%, transparent)`,
    `--bar-tool-hover:color-mix(in srgb, ${t.barInk} ${tool[1]}%, transparent)`,
    `--bar-line:color-mix(in srgb, ${t.barInk} ${tool[2]}%, transparent)`,
    `--sh-brand:0 6px 18px color-mix(in srgb, ${t.brand} ${dark ? 30 : 26}%, transparent)`,
  ].join(';');
}

/**
 * One stylesheet for light, dark (chosen) and dark (system). `html:root` outranks globals.css's
 * `:root`, so it wins whatever order the two stylesheets load in. Returns '' for a broken theme.
 */
export function themeCss(theme: RemoteTheme | null): string {
  if (!theme) return '';
  const colours = [...Object.values(theme.light), ...Object.values(theme.dark)].filter((v) => v.startsWith('#'));
  if (!colours.length || !colours.every((v) => HEX.test(v))) return '';
  const dark = vars(theme.dark, true);
  return `html:root{${vars(theme.light, false)}}html:root[data-theme='dark']{${dark}}@media (prefers-color-scheme: dark){html:root:not([data-theme='light']){${dark}}}`;
}

export function applyBrandCss(css: string, theme?: RemoteTheme | null): void {
  if (typeof document === 'undefined') return;
  let el = document.getElementById(STYLE_ID) as HTMLStyleElement | null;
  if (!css) {
    el?.remove();
  } else {
    if (!el) {
      el = document.createElement('style');
      el.id = STYLE_ID;
      document.head.appendChild(el);
    }
    el.textContent = css;
  }
  // The browser's address bar / status bar follows the header bar.
  const bar = theme?.light.barFrom;
  if (bar) document.querySelectorAll('meta[name="theme-color"]').forEach((m) => m.setAttribute('content', bar));
}

/** Fetch the current theme, paint it, and remember it for the next visit. */
export async function syncBrandTheme(): Promise<void> {
  try {
    const response = await fetch(`${API_URL}/settings/public`);
    const theme = ((await response.json()) as { data?: { theme?: RemoteTheme | null } }).data?.theme ?? null;
    const css = themeCss(theme);
    try {
      if (css) localStorage.setItem(BRAND_CSS_KEY, css);
      else localStorage.removeItem(BRAND_CSS_KEY);
    } catch {
      /* storage blocked: it just is not remembered */
    }
    applyBrandCss(css, theme);
  } catch {
    /* offline: whatever was painted from the last visit stays */
  }
}

/** The CSS (as stored) read back by the inline boot script and by anything that needs the pin colour. */
export const brandColor = (): string => {
  if (typeof document === 'undefined') return '#0e8a3e';
  return getComputedStyle(document.documentElement).getPropertyValue('--brand').trim() || '#0e8a3e';
};
export const accentColor = (): string => {
  if (typeof document === 'undefined') return '#ffd23f';
  return getComputedStyle(document.documentElement).getPropertyValue('--sun').trim() || '#ffd23f';
};
