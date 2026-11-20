import assert from 'node:assert/strict';
import { test } from 'node:test';
import { buildPublicTheme, contrast, deriveTokens, isHex } from '../src/utils/theme';

const HEX = /^#[0-9a-f]{6}$/;
const DARK_SURFACE = '#101611';
const hexes = (o: Record<string, string>) => Object.values(o);

test('isHex accepts only #RRGGBB', () => {
  for (const ok of ['#0e8a3e', '#0E8A3E', '#ffffff']) assert.equal(isHex(ok), true, ok);
  for (const bad of ['', '0e8a3e', '#fff', '#12345g', 'red', '#0e8a3e00', undefined, null, 7]) assert.equal(isHex(bad as never), false, String(bad));
});

test('the default green gives readable text and a tinted surface in light mode', () => {
  const { light } = deriveTokens({ brand: '#0e8a3e', accent: '#ffd23f' });
  for (const v of hexes(light)) assert.match(v, HEX);
  assert.equal(light.brand, '#0e8a3e');
  assert.ok(contrast(light.brandText, light.brandTint) >= 4.5, 'brand text is readable on the tint');
  // Button labels are bold, so 3:1 (WCAG large text) is the bar; the live default green is 4.4:1.
  assert.ok(contrast(light.brandInk, light.brand) >= 3, 'ink on a brand button is readable');
  assert.ok(contrast(light.accentInk, light.accent) >= 4.5, 'ink on the accent bar is readable');
  assert.ok(contrast(light.barInk, light.barFrom) >= 4.5 && contrast(light.barInk, light.barTo) >= 4.5, 'header text is readable on both ends of the bar');
});

test('hover and press darken in light mode and the tint is lighter than the brand', () => {
  const { light } = deriveTokens({ brand: '#1a56db', accent: '#ffd23f' });
  const lum = (h: string) => contrast(h, '#000000');
  assert.ok(lum(light.brandHover) < lum(light.brand));
  assert.ok(lum(light.brandPress) < lum(light.brandHover));
  assert.ok(lum(light.brandTint) > lum(light.brand));
});

test('a very dark brand is lifted in dark mode so it stays readable on a dark page', () => {
  const { dark, light } = deriveTokens({ brand: '#0b1d4a', accent: '#ffd23f' });
  assert.ok(contrast(dark.brand, DARK_SURFACE) >= 4.5, `dark brand ${dark.brand} on a dark page`);
  assert.ok(contrast(dark.brandText, dark.brandTint) >= 4.5);
  assert.notEqual(dark.brand, light.brand);
});

test('a very light brand still gets readable text and ink', () => {
  const { light } = deriveTokens({ brand: '#f4f4f4', accent: '#ffffff' });
  assert.ok(contrast(light.brandText, light.brandTint) >= 4.5);
  assert.ok(contrast(light.brandInk, light.brand) >= 4.5);
  assert.ok(contrast(light.accentInk, light.accent) >= 4.5);
});

test('an explicit dark brand wins over the derived one', () => {
  const { dark } = deriveTokens({ brand: '#0e8a3e', accent: '#ffd23f', darkBrand: '#7CFFB2' });
  assert.equal(dark.brand, '#7cffb2');
});

test('invalid hex throws', () => {
  assert.throws(() => deriveTokens({ brand: 'green', accent: '#ffd23f' }));
});

test('buildPublicTheme: nothing saved means no theme; one colour keeps the other default', () => {
  assert.equal(buildPublicTheme(undefined), null);
  assert.equal(buildPublicTheme({}), null);
  assert.equal(buildPublicTheme({ brand: '', accent: '', darkBrand: '' }), null);
  const onlyBrand = buildPublicTheme({ brand: '#1a56db' });
  assert.equal(onlyBrand?.source.brand, '#1a56db');
  assert.equal(onlyBrand?.source.accent, '#ffd23f');
  const onlyAccent = buildPublicTheme({ accent: '#ff5a00' });
  assert.equal(onlyAccent?.source.brand, '#0e8a3e');
  assert.equal(onlyAccent?.light.accent, '#ff5a00');
});

test('a corrupt saved colour is ignored instead of breaking every client', () => {
  assert.equal(buildPublicTheme({ brand: 'banana', accent: 'nope' }), null);
  assert.equal(buildPublicTheme({ brand: 'banana', accent: '#ff5a00' })?.source.brand, '#0e8a3e');
});
