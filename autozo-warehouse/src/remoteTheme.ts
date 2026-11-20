import * as Keychain from 'react-native-keychain';
import { API_URL } from './config';
import { accents, colors } from './theme';

/**
 * The colours the super admin picked (Admin > Theme & Colours), already worked out by the server.
 * Styles are compiled when a screen's module is first imported, so the palette is repainted BEFORE
 * the app is imported: index.js awaits `bootstrapTheme()` and only then loads App. Nothing here may
 * import a screen or a component.
 */
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

const SERVICE = 'com.autozo.warehouse.theme';
const HEX = /^#[0-9a-fA-F]{6}$/;
const KEYS: (keyof ThemeTokens)[] = [
  'brand', 'brandHover', 'brandPress', 'brandDeep', 'brandInk', 'brandTint', 'brandTint2', 'brandLine', 'brandText',
  'accent', 'accentDeep', 'accentInk', 'accentTint', 'accentLine', 'barFrom', 'barTo', 'barInk',
];

const validTokens = (t: unknown): t is ThemeTokens =>
  !!t && typeof t === 'object' && KEYS.every((k) => typeof (t as Record<string, unknown>)[k] === 'string' && HEX.test((t as Record<string, string>)[k]));

/** The server's theme, or null when it is missing or any colour is not a plain #RRGGBB. */
export function parseTheme(raw: unknown): RemoteTheme | null {
  try {
    const value = typeof raw === 'string' ? JSON.parse(raw) : raw;
    if (!value || typeof value !== 'object') return null;
    const { light: l, dark: d, source } = value as RemoteTheme;
    return validTokens(l) && validTokens(d) ? { light: l, dark: d, source } : null;
  } catch {
    return null;
  }
}

/** This app has one (light) look, so it paints the light tokens. A missing or broken theme changes nothing. */
export function applyTheme(theme: RemoteTheme | null): void {
  if (!theme) return;
  const t = theme.light;
  colors.primary = t.brand;
  colors.primaryDark = t.brandPress;
  colors.primarySoft = t.brandTint;
  accents.orange = { base: t.brand, soft: t.brandTint2, ink: t.brandText };
}

async function readCache(): Promise<RemoteTheme | null> {
  try {
    const saved = await Keychain.getGenericPassword({ service: SERVICE });
    return saved ? parseTheme(saved.password) : null;
  } catch {
    return null;
  }
}

async function writeCache(theme: RemoteTheme | null): Promise<void> {
  try {
    if (theme) await Keychain.setGenericPassword('theme', JSON.stringify(theme), { service: SERVICE });
    else await Keychain.resetGenericPassword({ service: SERVICE });
  } catch {
    /* the theme just is not remembered */
  }
}

/** The current theme from the server, or `undefined` when it could not be reached in time. */
async function fetchTheme(timeoutMs: number): Promise<RemoteTheme | null | undefined> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  try {
    const response = await fetch(`${API_URL}/settings/public`, { signal: controller.signal });
    const body = (await response.json()) as { data?: { theme?: unknown } };
    return body.data && 'theme' in body.data ? parseTheme(body.data.theme) : undefined;
  } catch {
    return undefined;
  } finally {
    clearTimeout(timer);
  }
}

/**
 * Called once at launch, before the app loads. Takes the server's current colours when it answers
 * quickly, otherwise the ones remembered from the last launch; never throws and never waits long.
 */
export async function bootstrapTheme(timeoutMs = 1500): Promise<void> {
  const fresh = await fetchTheme(timeoutMs);
  if (fresh !== undefined) {
    applyTheme(fresh);
    void writeCache(fresh); // null (reset by the admin) clears what was remembered
    return;
  }
  applyTheme(await readCache());
}
