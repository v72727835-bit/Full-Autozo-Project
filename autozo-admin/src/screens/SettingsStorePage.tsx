import React, { useEffect, useMemo, useRef, useState } from 'react';
import { fetchCategories, fetchSettings, saveSettings, uploadImages } from '../api/admin';
import { getErrorMessage } from '../api/client';
import { IconImage } from '../components/icons';
import { Button, CenterSpinner, ErrorBanner, Field } from '../components/ui';
import { Category, CategoryRef, Settings } from '../types';

const idOf = (value: CategoryRef | string): string => (typeof value === 'string' ? value : value._id);

/**
 * Shop-wide switches: the festival tab, which aisles ship in six days, where
 * cash on delivery is off, the rider cash limit and the app download links.
 *
 * Every rule is stored against a *sub category* and applies to everything
 * under it, so a change here covers all of that aisle's child categories and
 * products without touching them one by one.
 */
export default function SettingsStorePage() {
  const [settings, setSettings] = useState<Settings | null>(null);
  const [categories, setCategories] = useState<Category[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [saved, setSaved] = useState('');

  const load = () => {
    setLoading(true);
    Promise.all([fetchSettings(), fetchCategories()])
      .then(([s, c]) => {
        setSettings(s);
        setCategories(c);
        setError('');
      })
      .catch((err) => setError(getErrorMessage(err)))
      .finally(() => setLoading(false));
  };
  useEffect(load, []);

  const subCategories = useMemo(
    () => categories.filter((c) => c.level === 2).sort((a, b) => a.name.localeCompare(b.name)),
    [categories],
  );

  const save = async (patch: Partial<Settings> | Record<string, unknown>) => {
    setError('');
    try {
      setSettings(await saveSettings(patch as Partial<Settings>));
      setSaved('Saved');
      setTimeout(() => setSaved(''), 2000);
    } catch (err) {
      setError(getErrorMessage(err));
    }
  };

  if (loading || !settings) return <CenterSpinner />;

  return (
    <>
      <div className="page-header">
        <div>
          <h1 className="page-title">Store settings</h1>
          <div className="page-subtitle">
            Festival tab, six-day delivery aisles, cash-on-delivery rules, the rider cash limit and the app download links.
          </div>
        </div>
        {saved && <span className="badge badge-success">{saved}</span>}
      </div>

      <ErrorBanner message={error} />

      <FestivalCard settings={settings} subCategories={subCategories} onSave={save} />
      <DeliveryCard settings={settings} subCategories={subCategories} onSave={save} />
      <CodCard settings={settings} subCategories={subCategories} onSave={save} />
      <RiderCard settings={settings} onSave={save} />
      <CompanyCard settings={settings} onSave={save} />
      <SocialCard settings={settings} onSave={save} />
      <AppLinksCard settings={settings} onSave={save} />
    </>
  );
}

/* ------------------------------- festival -------------------------------- */

function FestivalCard({
  settings,
  subCategories,
  onSave,
}: {
  settings: Settings;
  subCategories: Category[];
  onSave: (patch: Record<string, unknown>) => Promise<void>;
}) {
  const [enabled, setEnabled] = useState(settings.festival.enabled);
  const [name, setName] = useState(settings.festival.name);
  const [banner, setBanner] = useState(settings.festival.banner ?? '');
  const [sections, setSections] = useState(
    settings.festival.sections.map((s) => ({ title: s.title, category: idOf(s.category) })),
  );
  const [uploading, setUploading] = useState(false);
  const [saving, setSaving] = useState(false);
  const fileRef = useRef<HTMLInputElement>(null);

  const pickBanner = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    e.target.value = '';
    if (!file) return;
    setUploading(true);
    try {
      const [url] = await uploadImages([file]);
      setBanner(url);
    } finally {
      setUploading(false);
    }
  };

  const submit = async () => {
    setSaving(true);
    await onSave({ festival: { enabled, name: name.trim() || 'Festival', banner, sections: sections.filter((s) => s.category) } });
    setSaving(false);
  };

  return (
    <div className="card card-pad" style={{ marginBottom: 18 }}>
      <h2 className="card-title">Festival tab</h2>
      <div className="page-subtitle" style={{ marginBottom: 14 }}>
        A tab beside Home in the app and website. Rename it for each festival; the banner sits at the top and each row below shows
        products from one aisle with a “See all” link.
      </div>

      <div className="field-row">
        <Field label="Tab name (Rakhi, Diwali, Holi…)">
          <input value={name} onChange={(e) => setName(e.target.value)} maxLength={30} />
        </Field>
        <Field label="Visible">
          <div className="checkbox-row" style={{ height: 38 }}>
            <input id="fest-on" type="checkbox" checked={enabled} onChange={(e) => setEnabled(e.target.checked)} />
            <label htmlFor="fest-on" style={{ marginBottom: 0 }}>
              Show this tab to customers
            </label>
          </div>
        </Field>
      </div>

      <Field label="Cover banner (recommended 1560 × 540 px)">
        <div className="banner-preview banner-preview-lg" onClick={() => fileRef.current?.click()} role="button" tabIndex={0}>
          {banner ? (
            <img src={banner} alt="" />
          ) : (
            <div className="banner-preview-empty">
              <IconImage size={26} />
              <span>{uploading ? 'Uploading…' : 'Click to upload'}</span>
            </div>
          )}
        </div>
        <div className="row-flex" style={{ marginTop: 8 }}>
          <Button type="button" variant="secondary" size="sm" onClick={() => fileRef.current?.click()} disabled={uploading}>
            {uploading ? 'Uploading…' : banner ? 'Replace banner' : 'Upload banner'}
          </Button>
          {banner && (
            <Button type="button" variant="ghost" size="sm" onClick={() => setBanner('')}>
              Remove
            </Button>
          )}
        </div>
        <input ref={fileRef} type="file" accept="image/png,image/jpeg,image/webp,image/gif" hidden onChange={pickBanner} />
      </Field>

      <div className="stat-label" style={{ margin: '14px 0 6px' }}>
        Rows on the festival page
      </div>
      {sections.map((row, i) => (
        <div key={i} className="row-flex" style={{ marginBottom: 8 }}>
          <input
            value={row.title}
            placeholder="Row title (blank = aisle name)"
            onChange={(e) => setSections((cur) => cur.map((s, j) => (i === j ? { ...s, title: e.target.value } : s)))}
            style={{ flex: 1 }}
          />
          <select
            value={row.category}
            onChange={(e) => setSections((cur) => cur.map((s, j) => (i === j ? { ...s, category: e.target.value } : s)))}
            style={{ width: 220 }}
          >
            <option value="">Choose an aisle…</option>
            {subCategories.map((c) => (
              <option key={c._id} value={c._id}>
                {c.name}
              </option>
            ))}
          </select>
          <Button variant="ghost" size="sm" onClick={() => setSections((cur) => cur.filter((_, j) => j !== i))}>
            Remove
          </Button>
        </div>
      ))}
      <Button variant="secondary" size="sm" onClick={() => setSections((cur) => [...cur, { title: '', category: '' }])}>
        + Add row
      </Button>

      <div className="modal-actions">
        <Button onClick={submit} disabled={saving || uploading}>
          {saving ? 'Saving…' : 'Save festival tab'}
        </Button>
      </div>
    </div>
  );
}

/* ----------------------------- six-day aisles ---------------------------- */

function CategoryPicker({
  title,
  hint,
  subCategories,
  selected,
  onToggle,
}: {
  title: string;
  hint: string;
  subCategories: Category[];
  selected: Set<string>;
  onToggle: (id: string) => void;
}) {
  return (
    <>
      <div className="stat-label" style={{ marginBottom: 4 }}>
        {title}
      </div>
      <div className="page-subtitle" style={{ marginBottom: 10 }}>
        {hint}
      </div>
      <div className="picker-grid">
        {subCategories.map((c) => (
          <label key={c._id} className="checkbox-row picker-item">
            <input type="checkbox" checked={selected.has(c._id)} onChange={() => onToggle(c._id)} />
            <span>{c.name}</span>
          </label>
        ))}
      </div>
    </>
  );
}

function DeliveryCard({
  settings,
  subCategories,
  onSave,
}: {
  settings: Settings;
  subCategories: Category[];
  onSave: (patch: Record<string, unknown>) => Promise<void>;
}) {
  const [days, setDays] = useState(String(settings.sixDay.days));
  const [picked, setPicked] = useState(() => new Set(settings.sixDay.categories.map(idOf)));
  const [saving, setSaving] = useState(false);

  const toggle = (id: string) =>
    setPicked((cur) => {
      const next = new Set(cur);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });

  const submit = async () => {
    setSaving(true);
    await onSave({ sixDay: { days: Number(days) || 6, categories: [...picked] } });
    setSaving(false);
  };

  return (
    <div className="card card-pad" style={{ marginBottom: 18 }}>
      <h2 className="card-title">{days}-day delivery aisles</h2>
      <div className="page-subtitle" style={{ marginBottom: 14 }}>
        Every product in these aisles — and in all of their child categories — shows a {days}-day delivery promise on the listing, in
        the cart and on the order. The 19-minute / 2-hour / next-day choice on the home page does not change it.
      </div>

      <Field label="Delivery promise (days)">
        <input type="number" min={1} max={60} value={days} onChange={(e) => setDays(e.target.value)} style={{ width: 120 }} />
      </Field>

      <CategoryPicker
        title="Aisles with this promise"
        hint="Tick a sub category to apply it to everything inside."
        subCategories={subCategories}
        selected={picked}
        onToggle={toggle}
      />

      <div className="modal-actions">
        <Button onClick={submit} disabled={saving}>
          {saving ? 'Saving…' : 'Save delivery aisles'}
        </Button>
      </div>
    </div>
  );
}

/* ------------------------------ COD aisles ------------------------------- */

function CodCard({
  settings,
  subCategories,
  onSave,
}: {
  settings: Settings;
  subCategories: Category[];
  onSave: (patch: Record<string, unknown>) => Promise<void>;
}) {
  const [picked, setPicked] = useState(() => new Set(settings.cod.disabledCategories.map(idOf)));
  const [message, setMessage] = useState(settings.cod.message);
  const [saving, setSaving] = useState(false);

  const toggle = (id: string) =>
    setPicked((cur) => {
      const next = new Set(cur);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });

  const submit = async () => {
    setSaving(true);
    await onSave({ cod: { disabledCategories: [...picked], message } });
    setSaving(false);
  };

  return (
    <div className="card card-pad" style={{ marginBottom: 18 }}>
      <h2 className="card-title">Cash on delivery</h2>
      <div className="page-subtitle" style={{ marginBottom: 14 }}>
        Tick the aisles that cannot be paid in cash. Customers still see the COD option, but checkout explains why it is not
        available for those items.
      </div>

      <CategoryPicker
        title="Aisles without cash on delivery"
        hint="Applies to every child category and product inside."
        subCategories={subCategories}
        selected={picked}
        onToggle={toggle}
      />

      <Field label="Message shown to the customer">
        <input value={message} onChange={(e) => setMessage(e.target.value)} maxLength={300} />
      </Field>

      <div className="modal-actions">
        <Button onClick={submit} disabled={saving}>
          {saving ? 'Saving…' : 'Save COD rules'}
        </Button>
      </div>
    </div>
  );
}

/* ------------------------------ rider limit ------------------------------ */

function RiderCard({ settings, onSave }: { settings: Settings; onSave: (patch: Record<string, unknown>) => Promise<void> }) {
  const [limit, setLimit] = useState(String(settings.riderCodLimit));
  const [kb, setKb] = useState(String(settings.imageMaxKb));
  const [saving, setSaving] = useState(false);

  const submit = async () => {
    setSaving(true);
    await onSave({ riderCodLimit: Number(limit) || 0, imageMaxKb: Number(kb) || 200 });
    setSaving(false);
  };

  return (
    <div className="card card-pad" style={{ marginBottom: 18 }}>
      <h2 className="card-title">Riders &amp; uploads</h2>
      <div className="field-row">
        <Field label="Pause a rider at this much uncollected COD (₹)">
          <input type="number" min={0} value={limit} onChange={(e) => setLimit(e.target.value)} />
        </Field>
        <Field label="Largest product photo (KB)">
          <input type="number" min={20} max={5000} value={kb} onChange={(e) => setKb(e.target.value)} />
        </Field>
      </div>
      <div className="page-subtitle">
        A rider is paused automatically once their unsubmitted cash reaches the limit; they get no new orders until you resume them
        on the Riders page.
      </div>
      <div className="modal-actions">
        <Button onClick={submit} disabled={saving}>
          {saving ? 'Saving…' : 'Save'}
        </Button>
      </div>
    </div>
  );
}

/* ------------------------------- app links ------------------------------- */

function AppLinksCard({ settings, onSave }: { settings: Settings; onSave: (patch: Record<string, unknown>) => Promise<void> }) {
  const [android, setAndroid] = useState(settings.appLinks?.android ?? '');
  const [ios, setIos] = useState(settings.appLinks?.ios ?? '');
  const [rider, setRider] = useState(settings.appLinks?.rider ?? '');
  const [warehouse, setWarehouse] = useState(settings.appLinks?.warehouse ?? '');
  const [saving, setSaving] = useState(false);

  const submit = async () => {
    setSaving(true);
    await onSave({ appLinks: { android, ios, rider, warehouse } });
    setSaving(false);
  };

  return (
    <div className="card card-pad" style={{ marginBottom: 18 }}>
      <h2 className="card-title">App download links</h2>
      <div className="page-subtitle" style={{ marginBottom: 14 }}>
        Shown in the website footer. Point each app at its APK or Play Store listing.
      </div>
      <Field label="Android (APK or Play Store)">
        <input value={android} onChange={(e) => setAndroid(e.target.value)} placeholder="https://…/autozo.apk" />
      </Field>
      <Field label="Rider app (APK or Play Store)">
        <input value={rider} onChange={(e) => setRider(e.target.value)} placeholder="https://…/autozo-rider.apk" />
      </Field>
      <Field label="Warehouse app (APK or Play Store)">
        <input value={warehouse} onChange={(e) => setWarehouse(e.target.value)} placeholder="https://…/autozo-warehouse.apk" />
      </Field>
      <Field label="iOS (App Store)">
        <input value={ios} onChange={(e) => setIos(e.target.value)} placeholder="https://apps.apple.com/…" />
      </Field>
      <div className="modal-actions">
        <Button onClick={submit} disabled={saving}>
          {saving ? 'Saving…' : 'Save links'}
        </Button>
      </div>
    </div>
  );
}

/* ---------------------------- company and bill ---------------------------- */

function ImageField({ label, hint, value, onChange }: { label: string; hint: string; value: string; onChange: (url: string) => void }) {
  const ref = useRef<HTMLInputElement>(null);
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState('');
  const pick = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    e.target.value = '';
    if (!file) return;
    setBusy(true);
    setErr('');
    try {
      const [url] = await uploadImages([file]);
      onChange(url);
    } catch (error) {
      setErr(error instanceof Error ? error.message : 'Could not upload the image.');
    } finally {
      setBusy(false);
    }
  };
  return (
    <Field label={label}>
      <div style={{ display: 'flex', gap: 12, alignItems: 'center' }}>
        <div style={{ width: 96, height: 64, border: '1px dashed var(--border, #475569)', borderRadius: 8, display: 'flex', alignItems: 'center', justifyContent: 'center', background: '#fff', overflow: 'hidden' }}>
          {value ? <img src={value} alt={label} style={{ maxWidth: '100%', maxHeight: '100%', objectFit: 'contain' }} /> : <span style={{ color: '#94a3b8', fontSize: 11 }}>No image</span>}
        </div>
        <div>
          <input ref={ref} type="file" accept="image/*" hidden onChange={pick} />
          <Button type="button" size="sm" variant="secondary" onClick={() => ref.current?.click()} disabled={busy}>{busy ? 'Uploading…' : value ? 'Change' : 'Upload'}</Button>
          {value ? <Button type="button" size="sm" variant="ghost" onClick={() => onChange('')}>Remove</Button> : null}
          <div className="page-subtitle" style={{ marginTop: 4 }}>{hint}</div>
          {err ? <div style={{ color: 'var(--danger, #ef4444)', fontSize: 12 }}>{err}</div> : null}
        </div>
      </div>
    </Field>
  );
}

function CompanyCard({ settings, onSave }: { settings: Settings; onSave: (patch: Record<string, unknown>) => Promise<void> }) {
  const c = settings.company ?? {};
  const [f, setF] = useState({
    name: c.name ?? '', tagline: c.tagline ?? '', address: c.address ?? '', phone: c.phone ?? '', email: c.email ?? '', website: c.website ?? '',
    gstin: c.gstin ?? '', fssai: c.fssai ?? '', logo: c.logo ?? '', signature: c.signature ?? '', seal: c.seal ?? '',
    signatoryName: c.signatoryName ?? '', signatoryTitle: c.signatoryTitle ?? '', declaration: c.declaration ?? '', footerNote: c.footerNote ?? '',
  });
  const [saving, setSaving] = useState(false);
  const set = (k: keyof typeof f, v: string) => setF((p) => ({ ...p, [k]: v }));
  const submit = async () => {
    setSaving(true);
    await onSave({ company: f });
    setSaving(false);
  };
  return (
    <div className="card card-pad" style={{ marginBottom: 18 }}>
      <h2 className="card-title">Company and bill details</h2>
      <div className="page-subtitle" style={{ marginBottom: 14 }}>
        Printed on every invoice and POS bill: logo, signature, round seal / stamp, GSTIN and the declaration. Leave a field empty to hide it.
      </div>
      <div className="grid grid-2">
        <ImageField label="Company logo" hint="PNG with a transparent background looks best." value={f.logo} onChange={(v) => set('logo', v)} />
        <ImageField label="Round seal / stamp" hint="PNG with a transparent background." value={f.seal} onChange={(v) => set('seal', v)} />
        <ImageField label="Signature" hint="Signature on a transparent or white background." value={f.signature} onChange={(v) => set('signature', v)} />
        <div />
        <Field label="Company name"><input value={f.name} onChange={(e) => set('name', e.target.value)} placeholder="Autozo Retail Pvt Ltd" /></Field>
        <Field label="Tagline"><input value={f.tagline} onChange={(e) => set('tagline', e.target.value)} placeholder="Groceries in minutes" /></Field>
        <Field label="Phone"><input value={f.phone} onChange={(e) => set('phone', e.target.value)} /></Field>
        <Field label="Email"><input value={f.email} onChange={(e) => set('email', e.target.value)} /></Field>
        <Field label="Website"><input value={f.website} onChange={(e) => set('website', e.target.value)} placeholder="https://autozo.org" /></Field>
        <Field label="GSTIN"><input value={f.gstin} onChange={(e) => set('gstin', e.target.value.toUpperCase())} placeholder="09ABCDE1234F1Z5" /></Field>
        <Field label="FSSAI licence no."><input value={f.fssai} onChange={(e) => set('fssai', e.target.value)} /></Field>
        <Field label="Authorised signatory name"><input value={f.signatoryName} onChange={(e) => set('signatoryName', e.target.value)} /></Field>
        <Field label="Signatory title"><input value={f.signatoryTitle} onChange={(e) => set('signatoryTitle', e.target.value)} placeholder="Director" /></Field>
      </div>
      <Field label="Registered address"><textarea rows={2} value={f.address} onChange={(e) => set('address', e.target.value)} /></Field>
      <Field label="Declaration (printed on the invoice)"><textarea rows={3} value={f.declaration} onChange={(e) => set('declaration', e.target.value)} placeholder="We declare that this invoice shows the actual price of the goods described…" /></Field>
      <Field label="Footer note"><input value={f.footerNote} onChange={(e) => set('footerNote', e.target.value)} placeholder="This is a computer generated invoice." /></Field>
      <div className="modal-actions">
        <Button onClick={submit} disabled={saving}>{saving ? 'Saving…' : 'Save company details'}</Button>
      </div>
    </div>
  );
}

/* ------------------------------ social media ------------------------------ */

const SOCIALS: { key: 'facebook' | 'instagram' | 'youtube' | 'whatsapp' | 'x' | 'telegram' | 'linkedin'; label: string; hint: string }[] = [
  { key: 'facebook', label: 'Facebook', hint: 'https://facebook.com/yourpage' },
  { key: 'instagram', label: 'Instagram', hint: 'https://instagram.com/yourname' },
  { key: 'youtube', label: 'YouTube', hint: 'https://youtube.com/@yourchannel' },
  { key: 'whatsapp', label: 'WhatsApp', hint: 'https://wa.me/919876543210' },
  { key: 'x', label: 'X (Twitter)', hint: 'https://x.com/yourname' },
  { key: 'telegram', label: 'Telegram', hint: 'https://t.me/yourchannel' },
  { key: 'linkedin', label: 'LinkedIn', hint: 'https://linkedin.com/company/yourname' },
];

function SocialCard({ settings, onSave }: { settings: Settings; onSave: (patch: Record<string, unknown>) => Promise<void> }) {
  const [links, setLinks] = useState<Record<string, string>>(() => Object.fromEntries(SOCIALS.map((s) => [s.key, settings.socialLinks?.[s.key] ?? ''])));
  const [saving, setSaving] = useState(false);
  const submit = async () => {
    setSaving(true);
    await onSave({ socialLinks: links });
    setSaving(false);
  };
  return (
    <div className="card card-pad" style={{ marginBottom: 18 }}>
      <h2 className="card-title">Social media</h2>
      <div className="page-subtitle" style={{ marginBottom: 14 }}>
        Shown in the website footer and printed on every bill. Paste the full link (starting with https://). Leave empty to hide that icon.
      </div>
      {SOCIALS.map((s) => (
        <Field key={s.key} label={s.label}>
          <input value={links[s.key]} onChange={(e) => setLinks({ ...links, [s.key]: e.target.value })} placeholder={s.hint} />
        </Field>
      ))}
      <div className="modal-actions">
        <Button onClick={submit} disabled={saving}>{saving ? 'Saving…' : 'Save social links'}</Button>
      </div>
    </div>
  );
}
