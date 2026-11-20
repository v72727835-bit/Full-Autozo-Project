jest.mock('react-native-keychain', () => ({
  getGenericPassword: jest.fn().mockResolvedValue(false),
  setGenericPassword: jest.fn().mockResolvedValue(true),
  resetGenericPassword: jest.fn().mockResolvedValue(true),
}));

const tokens = (over: Record<string, string> = {}) => ({
  brand: '#1a56db', brandHover: '#174cc1', brandPress: '#1441a6', brandDeep: '#0f327f', brandInk: '#ffffff',
  brandTint: '#edf1fc', brandTint2: '#d6e1f9', brandLine: '#a3bbf1', brandText: '#1a56db',
  accent: '#ff5a00', accentDeep: '#e65100', accentInk: '#111111', accentTint: '#ffe6d9', accentLine: '#ffb58c',
  barFrom: '#ff6714', barTo: '#f55600', barInk: '#111111',
  ...over,
});
const theme = (light = tokens(), dark = tokens({ brand: '#5380e4', brandInk: '#111111', brandTint: '#121a2e' })) => ({
  source: { brand: '#1a56db', accent: '#ff5a00', darkBrand: null },
  light,
  dark,
});

describe('remote theme', () => {
  beforeEach(() => jest.resetModules());

  test('parseTheme accepts the server shape and rejects anything else', () => {
    const { parseTheme } = require('../src/theme/remoteTheme');
    expect(parseTheme(theme())?.light.brand).toBe('#1a56db');
    expect(parseTheme(null)).toBeNull();
    expect(parseTheme({})).toBeNull();
    expect(parseTheme(theme(tokens({ brand: 'blue' })))).toBeNull();
    expect(parseTheme(theme(tokens(), tokens({ barFrom: '#fff' })))).toBeNull();
    expect(parseTheme('{"light":1}')).toBeNull();
  });

  test('applyTheme repaints the brand and header in both palettes and leaves the rest alone', () => {
    const { light, dark } = require('../src/theme/palette');
    const before = { lightInk: light.ink, darkSurface: dark.surface, danger: light.danger };
    const { applyTheme, parseTheme } = require('../src/theme/remoteTheme');
    applyTheme(parseTheme(theme()));

    expect(light.brand).toBe('#1a56db');
    expect(light.brandPressed).toBe('#1441a6');
    expect(light.brandSurface).toBe('#edf1fc');
    expect(light.onBrand).toBe('#ffffff');
    expect(light.headerFrom).toBe('#ff6714');
    expect(light.headerTo).toBe('#f55600');
    expect(light.onHeader).toBe('#111111');
    expect(dark.brand).toBe('#5380e4');
    expect(dark.onBrand).toBe('#111111');

    expect(light.ink).toBe(before.lightInk);
    expect(dark.surface).toBe(before.darkSurface);
    expect(light.danger).toBe(before.danger);
  });

  test('a broken theme changes nothing', () => {
    const { light } = require('../src/theme/palette');
    const brand = light.brand;
    const { applyTheme, parseTheme } = require('../src/theme/remoteTheme');
    applyTheme(parseTheme(theme(tokens({ brand: 'nope' }))));
    expect(light.brand).toBe(brand);
  });
});
