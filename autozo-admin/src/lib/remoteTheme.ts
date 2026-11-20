import { API_URL } from '../config';

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

const KEY = 'autozo_brand_theme';
const STYLE_ID = 'autozo-theme';
const HEX = /^#[0-9a-fA-F]{6}$/;
const rgba = (hex: string, a: number) => `rgba(${[1, 3, 5].map((i) => parseInt(hex.slice(i, i + 2), 16)).join(', ')}, ${a})`;

/** The admin panel is a dark UI, so it paints with the dark-mode tokens. */
export function themeCss(theme: RemoteTheme): string {
  const t = theme.dark;
  if (![t.brand, t.brandText, t.brandDeep].every((v) => HEX.test(v))) return '';
  return `:root{--brand:${t.brand};--brand-2:${t.brandText};--brand-deep:${t.brandDeep};--brand-glow:${rgba(t.brand, 0.35)};--brand-soft:${rgba(t.brand, 0.12)};}`;
}

/** Paints the theme (or removes it, when null, so the built-in colours come back). */
export function applyTheme(theme: RemoteTheme | null): void {
  if (typeof document === 'undefined') return;
  const css = theme ? themeCss(theme) : '';
  let el = document.getElementById(STYLE_ID) as HTMLStyleElement | null;
  if (!css) {
    el?.remove();
    return;
  }
  if (!el) {
    el = document.createElement('style');
    el.id = STYLE_ID;
    document.head.appendChild(el);
  }
  el.textContent = css;
}

export function cachedTheme(): RemoteTheme | null {
  try {
    const raw = localStorage.getItem(KEY);
    return raw ? (JSON.parse(raw) as RemoteTheme) : null;
  } catch {
    return null;
  }
}

function remember(theme: RemoteTheme | null) {
  try {
    if (theme) localStorage.setItem(KEY, JSON.stringify(theme));
    else localStorage.removeItem(KEY);
  } catch {
    /* storage blocked: the theme just is not remembered */
  }
}

/** Paint the remembered theme at once (no flash), then fetch the current one and paint that. */
export async function syncTheme(): Promise<void> {
  applyTheme(cachedTheme());
  try {
    const response = await fetch(`${API_URL}/settings/public`);
    const theme = ((await response.json()) as { data?: { theme?: RemoteTheme | null } }).data?.theme ?? null;
    remember(theme);
    applyTheme(theme);
  } catch {
    /* offline: the remembered theme stays */
  }
}
