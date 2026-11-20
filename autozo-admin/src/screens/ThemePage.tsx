import React, { useEffect, useState } from 'react';
import { fetchSettings, saveSettings } from '../api/admin';
import { getErrorMessage } from '../api/client';
import { Button, Card, CenterSpinner, ErrorBanner } from '../components/ui';
import { syncTheme } from '../lib/remoteTheme';

const DEFAULT_BRAND = '#0e8a3e';
const DEFAULT_ACCENT = '#ffd23f';
const HEX = /^#[0-9a-fA-F]{6}$/;

/** Ready-made pairs: brand = buttons and links, accent = the header bar and highlights. */
const PRESETS: { name: string; brand: string; accent: string }[] = [
  { name: 'Autozo green', brand: '#0e8a3e', accent: '#ffd23f' },
  { name: 'Ocean blue', brand: '#1a56db', accent: '#ffb020' },
  { name: 'Sunset orange', brand: '#e8590c', accent: '#ffd23f' },
  { name: 'Royal purple', brand: '#6d28d9', accent: '#f5c542' },
  { name: 'Ruby red', brand: '#c92a2a', accent: '#ffd23f' },
  { name: 'Teal', brand: '#0f766e', accent: '#fbbf24' },
];

const luminance = (hex: string) => {
  const [r, g, b] = [1, 3, 5].map((i) => parseInt(hex.slice(i, i + 2), 16) / 255);
  const f = (c: number) => (c <= 0.03928 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4);
  return 0.2126 * f(r) + 0.7152 * f(g) + 0.0722 * f(b);
};
const inkOn = (hex: string) => (luminance(hex) > 0.4 ? '#111111' : '#ffffff');

function ColorField({ label, hint, value, onChange, fallback }: { label: string; hint: string; value: string; onChange: (v: string) => void; fallback: string }) {
  const valid = value === '' || HEX.test(value);
  return (
    <div className="field">
      <label>{label}</label>
      <div style={{ display: 'flex', gap: 10, alignItems: 'center' }}>
        <input
          type="color"
          aria-label={`${label} picker`}
          value={HEX.test(value) ? value : fallback}
          onChange={(e) => onChange(e.target.value)}
          style={{ width: 52, height: 40, padding: 2, cursor: 'pointer' }}
        />
        <input
          className="input"
          aria-label={`${label} hex code`}
          value={value}
          placeholder={fallback}
          maxLength={7}
          onChange={(e) => onChange(e.target.value.trim())}
          style={{ maxWidth: 140, fontFamily: 'monospace', borderColor: valid ? undefined : 'var(--danger, #e5484d)' }}
        />
        {value ? (
          <button type="button" className="btn btn-ghost btn-sm" onClick={() => onChange('')}>
            Use default
          </button>
        ) : (
          <span style={{ opacity: 0.6, fontSize: 13 }}>Default</span>
        )}
      </div>
      <div style={{ opacity: 0.65, fontSize: 12.5, marginTop: 4 }}>{hint}</div>
    </div>
  );
}

/**
 * The super admin picks the website's and apps' colours. The server works out the hover, tint and
 * dark-mode shades, so one pick restyles every page of the website, the admin panel and all apps.
 */
export default function ThemePage() {
  const [loaded, setLoaded] = useState(false);
  const [brand, setBrand] = useState('');
  const [accent, setAccent] = useState('');
  const [darkBrand, setDarkBrand] = useState('');
  const [saved, setSaved] = useState({ brand: '', accent: '', darkBrand: '' });
  const [error, setError] = useState('');
  const [note, setNote] = useState('');
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    fetchSettings()
      .then((s) => {
        const t = { brand: s.theme?.brand ?? '', accent: s.theme?.accent ?? '', darkBrand: s.theme?.darkBrand ?? '' };
        setBrand(t.brand);
        setAccent(t.accent);
        setDarkBrand(t.darkBrand);
        setSaved(t);
      })
      .catch((err) => setError(getErrorMessage(err)))
      .finally(() => setLoaded(true));
  }, []);

  if (!loaded) return <CenterSpinner />;

  const allValid = [brand, accent, darkBrand].every((v) => v === '' || HEX.test(v));
  const dirty = brand !== saved.brand || accent !== saved.accent || darkBrand !== saved.darkBrand;
  const shownBrand = HEX.test(brand) ? brand : DEFAULT_BRAND;
  const shownAccent = HEX.test(accent) ? accent : DEFAULT_ACCENT;

  const persist = async (next: { brand: string; accent: string; darkBrand: string }, message: string) => {
    setSaving(true);
    setError('');
    setNote('');
    try {
      await saveSettings({ theme: next });
      setSaved(next);
      await syncTheme();
      setNote(message);
    } catch (err) {
      setError(getErrorMessage(err));
    } finally {
      setSaving(false);
    }
  };

  return (
    <>
      <div className="page-header">
        <div>
          <h1 className="page-title">Theme &amp; colours</h1>
          <div className="page-subtitle">
            Pick the brand colours once. The website, this admin panel and every app use them - hover shades, soft backgrounds and dark mode are worked out for you.
          </div>
        </div>
        {note && <span className="badge badge-success">{note}</span>}
      </div>

      <ErrorBanner message={error} />

      <Card title="Ready-made palettes">
        <div style={{ display: 'flex', flexWrap: 'wrap', gap: 10 }}>
          {PRESETS.map((p) => (
            <button
              key={p.name}
              type="button"
              className="btn btn-ghost"
              onClick={() => {
                setBrand(p.brand);
                setAccent(p.accent);
                setDarkBrand('');
              }}
              style={{ display: 'flex', alignItems: 'center', gap: 8 }}
            >
              <span style={{ width: 18, height: 18, borderRadius: 9, background: p.brand, display: 'inline-block' }} />
              <span style={{ width: 18, height: 18, borderRadius: 9, background: p.accent, display: 'inline-block', marginLeft: -10 }} />
              {p.name}
            </button>
          ))}
        </div>
      </Card>

      <Card title="Colours">
        <ColorField label="Brand colour" hint="Buttons, links, prices and highlights." value={brand} onChange={setBrand} fallback={DEFAULT_BRAND} />
        <ColorField label="Accent colour" hint="The header bar on the website and apps, and small highlights." value={accent} onChange={setAccent} fallback={DEFAULT_ACCENT} />
        <ColorField
          label="Dark-mode brand (optional)"
          hint="Leave empty and a readable lighter shade of your brand colour is used in dark mode."
          value={darkBrand}
          onChange={setDarkBrand}
          fallback="#34c46e"
        />
        {!allValid && <ErrorBanner message="Colours must look like #0E8A3E (a # and six letters or digits)." />}
      </Card>

      <Card title="Preview">
        <div style={{ borderRadius: 14, overflow: 'hidden', border: '1px solid rgba(128,128,128,0.25)', maxWidth: 420 }}>
          <div style={{ background: `linear-gradient(100deg, ${shownAccent}, ${shownAccent})`, color: inkOn(shownAccent), padding: '14px 16px', fontWeight: 800 }}>
            Autozo · 19 min delivery
          </div>
          <div style={{ padding: 16, background: '#ffffff', color: '#111111', display: 'grid', gap: 12 }}>
            <div style={{ fontWeight: 700 }}>
              Fresh milk 500 ml <span style={{ color: shownBrand }}>₹32</span>
            </div>
            <div style={{ background: shownBrand + '1f', color: shownBrand, padding: '6px 10px', borderRadius: 8, fontSize: 13, width: 'fit-content', fontWeight: 600 }}>
              Free delivery above ₹199
            </div>
            <div style={{ background: shownBrand, color: inkOn(shownBrand), padding: '11px 14px', borderRadius: 10, textAlign: 'center', fontWeight: 800 }}>Add to cart</div>
          </div>
        </div>
        <div style={{ opacity: 0.65, fontSize: 12.5, marginTop: 8 }}>
          This is a close preview; the exact shades (and the dark-mode version) are worked out when you save. Apps pick up new colours the next time they open.
        </div>
      </Card>

      <div style={{ display: 'flex', gap: 10, marginBottom: 24 }}>
        <Button disabled={saving || !allValid || !dirty} onClick={() => void persist({ brand, accent, darkBrand }, 'Theme saved')}>
          {saving ? 'Saving…' : 'Save theme'}
        </Button>
        <Button
          variant="secondary"
          disabled={saving || (!saved.brand && !saved.accent && !saved.darkBrand)}
          onClick={() => {
            setBrand('');
            setAccent('');
            setDarkBrand('');
            void persist({ brand: '', accent: '', darkBrand: '' }, 'Back to the default colours');
          }}
        >
          Reset to default colours
        </Button>
      </div>
    </>
  );
}
