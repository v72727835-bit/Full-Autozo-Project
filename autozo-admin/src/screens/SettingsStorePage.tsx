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
