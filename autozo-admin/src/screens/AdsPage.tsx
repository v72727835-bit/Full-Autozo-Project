import React, { useEffect, useRef, useState } from 'react';
import { AdInput, createAd, deleteAd, fetchAds, updateAd, uploadImages } from '../api/admin';
import { getErrorMessage } from '../api/client';
import { IconImage, IconPlus } from '../components/icons';
import { Badge, Button, CenterSpinner, ErrorBanner, Field, Modal, Pagination, formatDate } from '../components/ui';
import { AD_PLACEMENTS, AdCampaign, AdPlacement } from '../types';

const PLACEMENT_LABEL: Record<AdPlacement, string> = {
  home_top: 'Home — top',
  home_mid: 'Home — middle',
  home_bottom: 'Home — bottom',
  category: 'Category pages',
  sidebar: 'Sidebar',
};

/** A campaign is live only when active and within its (optional) dates. */
function isLive(a: AdCampaign): boolean {
  if (!a.isActive) return false;
  const now = Date.now();
  if (a.startAt && now < new Date(a.startAt).getTime()) return false;
  if (a.endAt && now > new Date(a.endAt).getTime()) return false;
  return true;
}

export default function AdsPage() {
  const [ads, setAds] = useState<AdCampaign[]>([]);
  const [totalPages, setTotalPages] = useState(1);
  const [page, setPage] = useState(1);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [form, setForm] = useState<{ ad?: AdCampaign } | null>(null);

  const load = () => {
    setLoading(true);
    fetchAds({ page, limit: 20 })
      .then(({ items, meta }) => {
        setAds(items);
        setTotalPages(meta.totalPages);
      })
      .catch((err) => setError(getErrorMessage(err)))
      .finally(() => setLoading(false));
  };
  useEffect(load, [page]);

  const remove = async (a: AdCampaign) => {
    if (!confirm(`Delete the campaign "${a.title}"?`)) return;
    try {
      await deleteAd(a._id);
      load();
    } catch (err) {
      setError(getErrorMessage(err));
    }
  };

  return (
    <>
      <div className="page-header">
        <div>
          <h1 className="page-title">Ads &amp; Campaigns</h1>
          <div className="page-subtitle">
            Paid adverts for other brands, shown on the website. Each ad opens the advertiser&apos;s own link. Pick where it shows and,
            optionally, the dates it runs. Views and clicks are counted so you can report back to the advertiser.
          </div>
        </div>
        <Button onClick={() => setForm({})}>
          <IconPlus size={16} /> New campaign
        </Button>
      </div>

      <ErrorBanner message={error} />

      {loading ? (
        <CenterSpinner />
      ) : ads.length === 0 ? (
        <div className="card">
          <div className="empty-state">No campaigns yet. Add one to start showing a brand&apos;s advert on the website.</div>
        </div>
      ) : (
        <div className="banner-grid">
          {ads.map((a) => (
            <div key={a._id} className="card banner-card">
              <div className="banner-preview">
                <img src={a.image} alt="" />
              </div>
              <div className="banner-meta">
                <div style={{ fontWeight: 700 }}>{a.title}</div>
                <div className="cell-muted" style={{ fontSize: 12.5 }}>by {a.advertiser}</div>
                <div className="row-flex" style={{ gap: 6, flexWrap: 'wrap', marginTop: 4 }}>
                  {isLive(a) ? <Badge tone="success">Live</Badge> : <Badge tone="muted">{a.isActive ? 'Scheduled / ended' : 'Hidden'}</Badge>}
                  <Badge tone="info">{PLACEMENT_LABEL[a.placement]}</Badge>
                </div>
                <div className="cell-muted" style={{ fontSize: 12, marginTop: 4 }}>
                  {a.startAt || a.endAt
                    ? `${a.startAt ? formatDate(a.startAt) : 'now'} → ${a.endAt ? formatDate(a.endAt) : 'no end'}`
                    : 'Runs until you turn it off'}
                </div>
                <div className="cell-muted" style={{ fontSize: 12, marginTop: 4 }}>
                  👁 {a.impressions.toLocaleString('en-IN')} views · 👆 {a.clicks.toLocaleString('en-IN')} clicks
                </div>
                <div className="banner-actions" style={{ marginTop: 8 }}>
                  <span className="banner-actions-end">
                    <button className="btn btn-secondary btn-sm" onClick={() => setForm({ ad: a })}>Edit</button>
                    <button className="btn btn-danger btn-sm" onClick={() => remove(a)}>Delete</button>
                  </span>
                </div>
              </div>
            </div>
          ))}
        </div>
      )}

      <Pagination page={page} totalPages={totalPages} onChange={setPage} />

      {form && (
        <AdForm
          ad={form.ad}
          onClose={() => setForm(null)}
          onSaved={() => {
            setForm(null);
            load();
          }}
        />
      )}
    </>
  );
}

/** yyyy-mm-dd for a date input, from an ISO string. */
const toDateInput = (iso?: string | null) => (iso ? new Date(iso).toISOString().slice(0, 10) : '');
const fromDateInput = (v: string) => (v ? new Date(`${v}T00:00:00`).toISOString() : null);

function AdForm({ ad, onClose, onSaved }: { ad?: AdCampaign; onClose: () => void; onSaved: () => void }) {
  const [advertiser, setAdvertiser] = useState(ad?.advertiser ?? '');
  const [title, setTitle] = useState(ad?.title ?? '');
  const [image, setImage] = useState(ad?.image ?? '');
  const [targetUrl, setTargetUrl] = useState(ad?.targetUrl ?? '');
  const [placement, setPlacement] = useState<AdPlacement>(ad?.placement ?? 'home_mid');
  const [startAt, setStartAt] = useState(toDateInput(ad?.startAt));
  const [endAt, setEndAt] = useState(toDateInput(ad?.endAt));
  const [isActive, setIsActive] = useState(ad?.isActive ?? true);
  const [uploading, setUploading] = useState(false);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');
  const fileRef = useRef<HTMLInputElement>(null);

  const onFileChosen = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    e.target.value = '';
    if (!file) return;
    setUploading(true);
    setError('');
    try {
      const [url] = await uploadImages([file]);
      setImage(url);
    } catch (err) {
      setError(getErrorMessage(err));
    } finally {
      setUploading(false);
    }
  };

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!image) return setError('Upload an ad image first.');
    if (!/^https?:\/\//i.test(targetUrl)) return setError('Enter the full destination link, starting with https://');
    if (startAt && endAt && new Date(endAt) < new Date(startAt)) return setError('The end date is before the start date.');
    setSaving(true);
    setError('');
    const body: AdInput = {
      advertiser,
      title,
      image,
      targetUrl,
      placement,
      startAt: fromDateInput(startAt),
      endAt: fromDateInput(endAt),
      isActive,
      sortOrder: ad?.sortOrder ?? 0,
    };
    try {
      if (ad) await updateAd(ad._id, body);
      else await createAd(body);
      onSaved();
    } catch (err) {
      setError(getErrorMessage(err));
    } finally {
      setSaving(false);
    }
  };

  return (
    <Modal title={ad ? 'Edit campaign' : 'New campaign'} onClose={onClose}>
      <form onSubmit={submit}>
        <ErrorBanner message={error} />

        <div className="field-row">
          <Field label="Advertiser / brand">
            <input value={advertiser} onChange={(e) => setAdvertiser(e.target.value)} maxLength={120} placeholder="e.g. Tata Tea" required />
          </Field>
          <Field label="Ad title">
            <input value={title} onChange={(e) => setTitle(e.target.value)} maxLength={140} placeholder="Monsoon sale — 20% off" required />
          </Field>
        </div>

        <Field label="Ad image">
          <div className="banner-preview banner-preview-lg" onClick={() => fileRef.current?.click()} role="button" tabIndex={0}>
            {image ? (
              <img src={image} alt="" />
            ) : (
              <div className="banner-preview-empty">
                <IconImage size={26} />
                <span>{uploading ? 'Uploading…' : 'Click to upload'}</span>
              </div>
            )}
          </div>
          <div className="row-flex" style={{ marginTop: 8 }}>
            <Button type="button" variant="secondary" size="sm" onClick={() => fileRef.current?.click()} disabled={uploading}>
              {uploading ? 'Uploading…' : image ? 'Replace image' : 'Upload image'}
            </Button>
            <input value={image} onChange={(e) => setImage(e.target.value)} placeholder="Or paste an image URL" style={{ fontSize: 12.5, flex: 1 }} />
          </div>
          <input ref={fileRef} type="file" accept="image/png,image/jpeg,image/webp,image/gif" hidden onChange={onFileChosen} />
        </Field>

        <Field label="Destination link (where the ad opens)">
          <input value={targetUrl} onChange={(e) => setTargetUrl(e.target.value)} maxLength={500} placeholder="https://brand.example/offer" required />
        </Field>

        <Field label="Where it shows">
          <select value={placement} onChange={(e) => setPlacement(e.target.value as AdPlacement)}>
            {AD_PLACEMENTS.map((p) => (
              <option key={p} value={p}>
                {PLACEMENT_LABEL[p]}
              </option>
            ))}
          </select>
        </Field>

        <div className="field-row">
          <Field label="Start date (optional)">
            <input type="date" value={startAt} onChange={(e) => setStartAt(e.target.value)} />
          </Field>
          <Field label="End date (optional)">
            <input type="date" value={endAt} onChange={(e) => setEndAt(e.target.value)} />
          </Field>
        </div>

        <Field label="Visible">
          <div className="checkbox-row">
            <input type="checkbox" checked={isActive} onChange={(e) => setIsActive(e.target.checked)} id="ad-active" />
            <label htmlFor="ad-active" style={{ marginBottom: 0 }}>
              Show on the website (within the dates above)
            </label>
          </div>
        </Field>

        <div className="modal-actions">
          <Button type="button" variant="secondary" onClick={onClose}>
            Cancel
          </Button>
          <Button type="submit" disabled={saving || uploading}>
            {saving ? 'Saving…' : 'Save'}
          </Button>
        </div>
      </form>
    </Modal>
  );
}
