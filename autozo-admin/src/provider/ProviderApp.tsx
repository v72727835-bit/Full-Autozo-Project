"use client";

import { usePathname } from 'next/navigation';
import React, { useCallback, useEffect, useRef, useState } from 'react';
import { Navigate, NavLink, useNavigate } from '../navigation';
import {
  MyPlan,
  ProviderDashboard,
  ProviderMe,
  fetchMyPlan,
  providerAcceptRing,
  providerBookings,
  providerCreateService,
  providerDashboard,
  providerDeclineRing,
  providerDeleteService,
  providerMe,
  providerRing,
  providerServices,
  providerSetAvailability,
  providerSetBookingStatus,
  providerUpdateService,
  providerUploadImages,
  providerUploadVideo,
  serviceCategories,
} from '../api/admin';
import PlanView, { PlanBanner } from '../seller/Plan';
import ProviderWalletView from './Wallet';
import { getErrorMessage } from '../api/client';
import { IconBell, IconBox, IconChart, IconDashboard, IconReceipt, IconRupee, IconShield } from '../components/icons';
import { Badge, Button, CenterSpinner, ErrorBanner, Field, Modal } from '../components/ui';
import { useAuth } from '../context/AuthContext';
import { askNotificationPermission, playChime } from '../lib/alerts';
import type { BookingStatus, RingItem, ServiceBookingRow, ServiceCategoryRow, ServiceRow } from '../types';

const WEEKDAYS = ['mon', 'tue', 'wed', 'thu', 'fri', 'sat', 'sun'] as const;
const STATUS_TONE: Record<BookingStatus, 'success' | 'warn' | 'danger' | 'muted'> = {
  requested: 'warn', accepted: 'success', on_the_way: 'success', in_progress: 'success',
  completed: 'muted', cancelled: 'danger', rejected: 'danger', expired: 'danger',
};
const FORWARD: Record<string, { to: BookingStatus; label: string }> = {
  accepted: { to: 'on_the_way', label: 'Start travelling' },
  on_the_way: { to: 'in_progress', label: 'Start work' },
  in_progress: { to: 'completed', label: 'Complete (OTP)' },
};

/** The service provider's own panel: dashboard, services, bookings, account — with a live booking ring. */
export default function ProviderApp() {
  const { logout } = useAuth();
  const pathname = usePathname() ?? '/';
  const navigate = useNavigate();
  const [me, setMe] = useState<ProviderMe | null>(null);
  const [error, setError] = useState('');
  const [available, setAvailable] = useState(true);
  const [ring, setRing] = useState<RingItem[]>([]);
  const [plan, setPlan] = useState<MyPlan | null>(null);

  useEffect(() => {
    fetchMyPlan().then(setPlan).catch(() => undefined);
    providerMe().then((m) => { setMe(m); setAvailable(!m.providerBusy); }).catch((e) => setError(getErrorMessage(e)));
    askNotificationPermission();
  }, []);

  /* Poll the ring and keep the bell going while a booking is waiting for an answer. */
  const poll = useCallback(() => {
    providerRing().then(setRing).catch(() => undefined);
  }, []);
  useEffect(() => {
    poll();
    const t = setInterval(poll, 6000);
    return () => clearInterval(t);
  }, [poll]);
  useEffect(() => {
    if (ring.length === 0) return;
    playChime();
    const t = setInterval(playChime, 3000);
    return () => clearInterval(t);
  }, [ring.length]);
  useEffect(() => {
    document.title = ring.length > 0 ? `(${ring.length}) New booking · Autozo Provider` : 'Autozo Provider';
  }, [ring.length]);

  const approved = me?.providerStatus === 'approved';

  const toggleAvailability = async () => {
    const next = !available;
    setAvailable(next);
    try { await providerSetAvailability(next); } catch { setAvailable(!next); }
  };

  const accept = async (r: RingItem) => {
    try {
      await providerAcceptRing(r.dispatchId);
      setRing((cur) => cur.filter((x) => x.dispatchId !== r.dispatchId));
      navigate('/bookings');
    } catch (e) {
      setError(getErrorMessage(e));
      poll();
    }
  };
  const decline = async (r: RingItem) => {
    setRing((cur) => cur.filter((x) => x.dispatchId !== r.dispatchId));
    try { await providerDeclineRing(r.dispatchId); } catch { /* ignore */ }
  };

  if (!me) return error ? <ErrorBanner message={error} /> : <CenterSpinner />;

  const nav = [
    { to: '/', label: 'Dashboard', icon: <IconDashboard />, end: true },
    { to: '/services', label: 'My services', icon: <IconBox /> },
    { to: '/bookings', label: 'Bookings', icon: <IconReceipt /> },
    { to: '/wallet', label: 'Wallet', icon: <IconChart /> },
    { to: '/plan', label: 'My plan', icon: <IconRupee /> },
    { to: '/account', label: 'Account', icon: <IconShield /> },
  ];

  let page: React.ReactNode;
  switch (pathname) {
    case '/': page = <DashboardView approved={approved} />; break;
    case '/services': page = <ServicesView approved={approved} />; break;
    case '/bookings': page = <BookingsView />; break;
    case '/wallet': page = <ProviderWalletView />; break;
    case '/plan': page = plan ? <PlanView plan={plan} me={me} onPaid={setPlan} kind="provider" /> : <CenterSpinner />; break;
    case '/account': page = <AccountView me={me} onLogout={logout} />; break;
    default: return <Navigate to="/" replace />;
  }

  return (
    <div className="app-shell">
      <aside className="sidebar">
        <div className="sidebar-logo">
          <img className="logo-mark" src="/logo-mark.png" alt="Autozo" width={36} height={36} />
          <div className="logo-text"><b>Autozo</b><span>Service Provider</span></div>
        </div>
        <div className="sidebar-scroll">
          <div className="nav-section">Panel</div>
          {nav.map((item) => (
            <NavLink key={item.to} to={item.to} end={item.end} className={({ isActive }) => `nav-link${isActive ? ' active' : ''}`}>
              <span className="nav-icon">{item.icon}</span>
              {item.label}
            </NavLink>
          ))}
        </div>
        <div className="sidebar-footer">
          <div className="health-card">
            <div className="hc-title">
              <span className="pulse-dot" style={{ color: available ? 'var(--ok)' : 'var(--warn)' }} />
              {available ? 'Online — ready for bookings' : 'Offline'}
            </div>
            <div className="hc-sub">{me.name} · {me.phone}</div>
          </div>
          <button className="logout-btn" onClick={logout}>Log out</button>
        </div>
      </aside>

      <main className="main">
        <header className="topbar">
          <div className="wh-mobile-nav" role="navigation" aria-label="Provider menu">
            {nav.map((item) => (
              <NavLink key={item.to} to={item.to} end={item.end} className={({ isActive }) => `wh-chip${isActive ? ' active' : ''}`}>{item.label}</NavLink>
            ))}
          </div>
          <div className="top-actions">
            <Button size="sm" variant={available ? 'secondary' : 'primary'} onClick={toggleAvailability}>
              {available ? 'Go offline' : 'Go online'}
            </Button>
            <div className="user-chip">
              <div className="avatar">{me.name.slice(0, 2).toUpperCase()}</div>
              <div><div className="u-name">{me.name}</div><div className="u-role">Provider</div></div>
            </div>
          </div>
        </header>
        <div className="content">
          {approved && pathname !== '/plan' ? <PlanBanner plan={plan} kind="provider" /> : null}
          {!approved ? <div className="card" style={{ marginBottom: 14 }}><div className="empty-state">Your account is awaiting admin approval. You can look around, but you can’t add services or take bookings until you’re approved.</div></div> : null}
          {page}
        </div>
      </main>

      {ring.length > 0 && (
        <div className="ring-overlay" style={overlayStyle}>
          <div className="card" style={{ maxWidth: 420, width: '100%', padding: 22, textAlign: 'center' }}>
            <div style={{ fontSize: 42 }}>🔔</div>
            <h2 style={{ margin: '6px 0' }}>New booking{ring.length > 1 ? `s (${ring.length})` : ''} nearby</h2>
            <p className="cell-muted" style={{ marginBottom: 16 }}>A customer is waiting. Accept to take it before another provider does.</p>
            {ring.map((r) => (
              <div key={r.dispatchId} className="row-flex" style={{ justifyContent: 'center', marginBottom: 10 }}>
                <Button onClick={() => accept(r)}>Accept</Button>
                <Button variant="ghost" onClick={() => decline(r)}>Dismiss</Button>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}

const overlayStyle: React.CSSProperties = {
  position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.5)', display: 'grid', placeItems: 'center', zIndex: 1000, padding: 20,
};

/* ------------------------------ Dashboard ------------------------------ */
function DashboardView({ approved }: { approved: boolean }) {
  const [d, setD] = useState<ProviderDashboard | null>(null);
  const [error, setError] = useState('');
  useEffect(() => { providerDashboard().then(setD).catch((e) => setError(getErrorMessage(e))); }, []);
  if (error) return <ErrorBanner message={error} />;
  if (!d) return <CenterSpinner />;
  const tiles = [
    ['Total services', d.totalServices],
    ['Active services', d.activeServices],
    ['Total bookings', d.bookings],
    ['Today', d.todaysBookings],
    ['Earnings', `₹${d.earnings}`],
  ] as const;
  return (
    <>
      <div className="page-header"><div><h1 className="page-title">Dashboard</h1><div className="page-subtitle">{approved ? 'Your services and bookings at a glance.' : 'Awaiting approval.'}</div></div></div>
      {d.blockedByDues ? (
        <div className="card card-pad" style={{ marginBottom: 14, border: '2px solid var(--danger, #d33)', background: 'rgba(221,51,51,.08)' }}>
          <strong>New bookings are stopped — ₹{d.due} commission due</strong>
          <div className="cell-muted" style={{ marginTop: 4 }}>Pay it from the Wallet. Bookings start again as soon as the office confirms it.</div>
          <div style={{ marginTop: 8 }}><NavLink to="/wallet" className={() => 'btn btn-sm btn-primary'}>Open wallet</NavLink></div>
        </div>
      ) : null}
      <div style={{ display: 'grid', gap: 14, gridTemplateColumns: 'repeat(auto-fill, minmax(160px, 1fr))' }}>
        {tiles.map(([label, value]) => (
          <div key={label} className="card" style={{ padding: 16 }}>
            <div className="cell-muted">{label}</div>
            <div style={{ fontSize: 26, fontWeight: 800 }}>{value}</div>
          </div>
        ))}
      </div>
    </>
  );
}

/* ------------------------------ Services ------------------------------ */
const blankService = {
  category: '', title: '', description: '', price: 0, mrp: 0, priceUnit: 'fixed' as 'fixed' | 'hourly' | 'visit' | 'per_km', includedKm: 0, perKmRate: 0,
  durationMins: 60, serviceRadiusKm: 10, isActive: true, images: [] as string[], video: '', availability: [] as { day: string; open: string; close: string }[],
};

function ServicesView({ approved }: { approved: boolean }) {
  const [rows, setRows] = useState<ServiceRow[]>([]);
  const [cats, setCats] = useState<ServiceCategoryRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [open, setOpen] = useState(false);
  const [editing, setEditing] = useState<ServiceRow | null>(null);
  const [form, setForm] = useState<typeof blankService>(blankService);
  const [busy, setBusy] = useState(false);
  const [uploading, setUploading] = useState('');

  const addPhotos = async (files: FileList | null) => {
    const list = Array.from(files ?? []).slice(0, Math.max(0, 8 - form.images.length));
    if (!list.length) return;
    setUploading('Uploading photos…'); setError('');
    try {
      const urls = await providerUploadImages(list, { onProgress: (f) => setUploading(`Uploading photos… ${Math.round(f * 100)}%`) });
      setForm((cur) => ({ ...cur, images: [...cur.images, ...urls].slice(0, 8) }));
    } catch (e) { setError(getErrorMessage(e)); } finally { setUploading(''); }
  };
  const addVideo = async (files: FileList | null) => {
    const file = files?.[0];
    if (!file) return;
    setUploading('Uploading video…'); setError('');
    try {
      const url = await providerUploadVideo(file, (f) => setUploading(`Uploading video… ${Math.round(f * 100)}%`));
      setForm((cur) => ({ ...cur, video: url }));
    } catch (e) { setError(getErrorMessage(e)); } finally { setUploading(''); }
  };

  const load = () => {
    setLoading(true);
    providerServices().then(setRows).catch((e) => setError(getErrorMessage(e))).finally(() => setLoading(false));
  };
  useEffect(() => { load(); serviceCategories().then(setCats).catch(() => undefined); }, []);

  const startNew = () => { setEditing(null); setForm({ ...blankService, category: cats[0]?._id ?? '' }); setOpen(true); };
  const startEdit = (s: ServiceRow) => {
    setEditing(s);
    setForm({
      category: typeof s.category === 'object' ? s.category._id : s.category,
      title: s.title, description: s.description ?? '', price: s.price, mrp: s.mrp ?? 0, priceUnit: s.priceUnit, includedKm: s.includedKm ?? 0, perKmRate: s.perKmRate ?? 0,
      durationMins: s.durationMins, serviceRadiusKm: s.serviceRadiusKm, isActive: s.isActive,
      images: s.images ?? [], video: s.video ?? '', availability: s.availability ?? [],
    });
    setOpen(true);
  };

  const save = async () => {
    setBusy(true); setError('');
    try {
      const body: Record<string, unknown> = {
        category: form.category, title: form.title.trim(), description: form.description.trim() || undefined,
        price: Number(form.price), mrp: Number(form.mrp) || undefined, priceUnit: form.priceUnit,
        ...(form.priceUnit === 'per_km' ? { includedKm: Number(form.includedKm) || 0, perKmRate: Number(form.perKmRate) || 0 } : {}),
        durationMins: Number(form.durationMins), serviceRadiusKm: Number(form.serviceRadiusKm), isActive: form.isActive,
        images: form.images,
        video: form.video,
        availability: form.availability,
      };
      if (editing) await providerUpdateService(editing._id, body);
      else await providerCreateService(body);
      setOpen(false); load();
    } catch (e) { setError(getErrorMessage(e)); } finally { setBusy(false); }
  };

  const remove = async (s: ServiceRow) => {
    if (!window.confirm(`Delete "${s.title}"?`)) return;
    setError('');
    try { await providerDeleteService(s._id); load(); } catch (e) { setError(getErrorMessage(e)); }
  };

  const toggleDay = (day: string) => {
    setForm((f) => {
      const has = f.availability.find((a) => a.day === day);
      return has
        ? { ...f, availability: f.availability.filter((a) => a.day !== day) }
        : { ...f, availability: [...f.availability, { day, open: '09:00', close: '18:00' }] };
    });
  };
  const setDayTime = (day: string, key: 'open' | 'close', value: string) =>
    setForm((f) => ({ ...f, availability: f.availability.map((a) => (a.day === day ? { ...a, [key]: value } : a)) }));

  return (
    <>
      <div className="page-header">
        <div><h1 className="page-title">My services</h1><div className="page-subtitle">Add the services you offer, set their price and times, and switch them on or off.</div></div>
        <Button onClick={startNew} disabled={!approved}>Add service</Button>
      </div>
      <ErrorBanner message={error} />
      {loading ? <CenterSpinner /> : rows.length === 0 ? (
        <div className="card"><div className="empty-state">No services yet. {approved ? 'Add your first service.' : 'You can add services once approved.'}</div></div>
      ) : (
        <div className="card">
          <div className="table-wrap">
            <table>
              <thead><tr><th>Service</th><th>Price</th><th>Duration</th><th>Status</th><th /></tr></thead>
              <tbody>
                {rows.map((s) => (
                  <tr key={s._id}>
                    <td className="cell-name">{s.title}<div className="cell-muted">{typeof s.category === 'object' ? s.category.name : ''} · {s.bookingCount} booking(s)</div></td>
                    <td>₹{s.price}{s.priceUnit === 'hourly' ? '/hr' : s.priceUnit === 'visit' ? '/visit' : s.priceUnit === 'per_km' ? ` + ₹${s.perKmRate ?? 0}/km after ${s.includedKm ?? 0} km` : ''}</td>
                    <td className="cell-muted">{s.durationMins} min</td>
                    <td>{s.isActive ? <Badge tone="success">Active</Badge> : <Badge tone="danger">Hidden</Badge>}</td>
                    <td><div className="row-flex"><Button size="sm" variant="secondary" onClick={() => startEdit(s)}>Edit</Button><Button size="sm" variant="ghost" onClick={() => remove(s)}>Delete</Button></div></td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {open && (
        <Modal title={editing ? `Edit ${editing.title}` : 'Add service'} onClose={() => setOpen(false)}>
          <Field label="Category">
            <select value={form.category} onChange={(e) => setForm({ ...form, category: e.target.value })}>
              <option value="">Select a category</option>
              {cats.map((c) => <option key={c._id} value={c._id}>{c.name}</option>)}
            </select>
          </Field>
          <Field label="Title"><input value={form.title} onChange={(e) => setForm({ ...form, title: e.target.value })} /></Field>
          <Field label="Description"><textarea rows={3} value={form.description} onChange={(e) => setForm({ ...form, description: e.target.value })} /></Field>
          <div className="row-flex" style={{ gap: 10 }}>
            <Field label={form.priceUnit === 'per_km' ? 'Base fee (₹)' : 'Price (₹)'}><input type="number" value={form.price} onChange={(e) => setForm({ ...form, price: Number(e.target.value) })} /></Field>
            <Field label="MRP (optional)"><input type="number" value={form.mrp} onChange={(e) => setForm({ ...form, mrp: Number(e.target.value) })} /></Field>
            <Field label="Price unit">
              <select value={form.priceUnit} onChange={(e) => setForm({ ...form, priceUnit: e.target.value as typeof form.priceUnit })}>
                <option value="fixed">Fixed</option><option value="hourly">Per hour</option><option value="visit">Per visit</option><option value="per_km">Per km (towing, transport)</option>
              </select>
            </Field>
          </div>
          {form.priceUnit === 'per_km' ? (
            <div className="row-flex" style={{ gap: 10 }}>
              <Field label="Km covered by the base fee"><input type="number" min={0} value={form.includedKm} onChange={(e) => setForm({ ...form, includedKm: Number(e.target.value) })} /></Field>
              <Field label="Price for every extra km (₹)"><input type="number" min={0} value={form.perKmRate} onChange={(e) => setForm({ ...form, perKmRate: Number(e.target.value) })} /></Field>
              <div className="cell-muted" style={{ alignSelf: 'center' }}>Customer enters the km; fare is worked out. 20 km = ₹{Math.round(Number(form.price) + Math.max(0, 20 - Number(form.includedKm)) * Number(form.perKmRate))}</div>
            </div>
          ) : null}
          <div className="row-flex" style={{ gap: 10 }}>
            <Field label="Duration (min)"><input type="number" value={form.durationMins} onChange={(e) => setForm({ ...form, durationMins: Number(e.target.value) })} /></Field>
            <Field label="Service radius (km)"><input type="number" value={form.serviceRadiusKm} onChange={(e) => setForm({ ...form, serviceRadiusKm: Number(e.target.value) })} /></Field>
          </div>
          <div className="field">
            <span className="label">Photos ({form.images.length}/8)</span>
            <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', alignItems: 'center' }}>
              {form.images.map((u) => (
                <div key={u} style={{ position: 'relative' }}>
                  <img src={u} alt="" style={{ width: 72, height: 72, objectFit: 'cover', borderRadius: 10, border: '1px solid var(--line, #e6e8ee)' }} />
                  <button type="button" onClick={() => setForm({ ...form, images: form.images.filter((x) => x !== u) })} aria-label="Remove photo"
                    style={{ position: 'absolute', top: -6, right: -6, width: 22, height: 22, borderRadius: 11, border: 0, background: '#111', color: '#fff', cursor: 'pointer' }}>×</button>
                </div>
              ))}
              {form.images.length < 8 ? (
                <label className="btn btn-secondary btn-sm" style={{ cursor: 'pointer' }}>
                  + Add photos
                  <input type="file" accept="image/*" multiple hidden onChange={(e) => { void addPhotos(e.target.files); e.target.value = ''; }} />
                </label>
              ) : null}
            </div>
          </div>
          <div className="field">
            <span className="label">Video (optional, max 15 MB)</span>
            {form.video ? (
              <div className="row-flex" style={{ gap: 8, alignItems: 'center' }}>
                <video src={form.video} controls style={{ width: 220, borderRadius: 10 }} />
                <Button size="sm" variant="ghost" onClick={() => setForm({ ...form, video: '' })}>Remove</Button>
              </div>
            ) : (
              <label className="btn btn-secondary btn-sm" style={{ cursor: 'pointer', alignSelf: 'flex-start' }}>
                + Upload video
                <input type="file" accept="video/mp4,video/webm" hidden onChange={(e) => { void addVideo(e.target.files); e.target.value = ''; }} />
              </label>
            )}
          </div>
          {uploading ? <div className="cell-muted" style={{ marginBottom: 8 }}>{uploading}</div> : null}
          <div className="field">
            <span className="label">Available days & times (optional)</span>
            {WEEKDAYS.map((day) => {
              const slot = form.availability.find((a) => a.day === day);
              return (
                <div key={day} className="row-flex" style={{ gap: 8, alignItems: 'center', marginBottom: 4 }}>
                  <label style={{ width: 54, display: 'flex', gap: 6, alignItems: 'center' }}>
                    <input type="checkbox" checked={!!slot} onChange={() => toggleDay(day)} />
                    {day}
                  </label>
                  {slot ? (
                    <>
                      <input type="time" value={slot.open} onChange={(e) => setDayTime(day, 'open', e.target.value)} style={{ width: 120 }} />
                      <span>–</span>
                      <input type="time" value={slot.close} onChange={(e) => setDayTime(day, 'close', e.target.value)} style={{ width: 120 }} />
                    </>
                  ) : null}
                </div>
              );
            })}
          </div>
          <label className="row-flex" style={{ gap: 8, alignItems: 'center', marginTop: 8 }}>
            <input type="checkbox" checked={form.isActive} onChange={(e) => setForm({ ...form, isActive: e.target.checked })} />
            <span>Visible to customers</span>
          </label>
          <div className="row-flex" style={{ marginTop: 12 }}>
            <Button disabled={busy || !!uploading || !form.category || form.title.trim().length < 2} onClick={save}>{editing ? 'Save' : 'Create'}</Button>
            <Button variant="ghost" onClick={() => setOpen(false)}>Cancel</Button>
          </div>
        </Modal>
      )}
    </>
  );
}

/* ------------------------------ Bookings ------------------------------ */
function BookingsView() {
  const [rows, setRows] = useState<ServiceBookingRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [active, setActive] = useState<ServiceBookingRow | null>(null);
  const [otp, setOtp] = useState('');
  const [km, setKm] = useState('');
  const [busy, setBusy] = useState(false);

  const load = () => {
    setLoading(true);
    providerBookings({ page: 1, limit: 50 }).then(({ items }) => setRows(items)).catch((e) => setError(getErrorMessage(e))).finally(() => setLoading(false));
  };
  useEffect(() => {
    load();
    const t = setInterval(load, 15000);
    return () => clearInterval(t);
  }, []);

  const advance = async (b: ServiceBookingRow) => {
    const step = FORWARD[b.status];
    if (!step) return;
    setBusy(true); setError('');
    try {
      await providerSetBookingStatus(b._id, step.to, step.to === 'completed' ? otp : undefined, step.to === 'completed' && b.snapshot.priceUnit === 'per_km' && b.paymentMethod === 'cod' && Number(km) > 0 ? Number(km) : undefined);
      setActive(null); setOtp(''); setKm(''); load();
    } catch (e) { setError(getErrorMessage(e)); } finally { setBusy(false); }
  };

  const nameOf = (v: { name?: string; phone?: string } | string | undefined) => (typeof v === 'object' ? v?.name : undefined);
  const phoneOf = (v: { name?: string; phone?: string } | string | undefined) => (typeof v === 'object' ? v?.phone : undefined);

  return (
    <>
      <div className="page-header"><div><h1 className="page-title">Bookings</h1><div className="page-subtitle">Every booking you accepted, with full customer and job details.</div></div></div>
      <ErrorBanner message={error} />
      {loading ? <CenterSpinner /> : rows.length === 0 ? (
        <div className="card"><div className="empty-state">No bookings yet. Accepted bookings show up here.</div></div>
      ) : (
        <div className="card">
          <div className="table-wrap">
            <table>
              <thead><tr><th>Booking</th><th>Customer</th><th>Amount</th><th>Status</th><th /></tr></thead>
              <tbody>
                {rows.map((b) => (
                  <tr key={b._id}>
                    <td className="cell-name">{b.snapshot.title}<div className="cell-muted">{b.bookingNumber}</div></td>
                    <td className="cell-muted">{nameOf(b.customer) ?? '-'}</td>
                    <td>₹{b.price}</td>
                    <td><Badge tone={STATUS_TONE[b.status]}>{b.status.replace(/_/g, ' ')}</Badge></td>
                    <td><Button size="sm" variant="secondary" onClick={() => { setActive(b); setOtp(''); }}>Open</Button></td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {active && (
        <Modal title={active.snapshot.title} onClose={() => setActive(null)}>
          <div className="cell-muted" style={{ marginBottom: 10 }}>{active.bookingNumber} · ₹{active.price} · <Badge tone={STATUS_TONE[active.status]}>{active.status.replace(/_/g, ' ')}</Badge></div>
          <div style={{ marginBottom: 10 }}>
            <strong>Customer</strong>
            <div>{nameOf(active.customer) ?? '-'}{phoneOf(active.customer) ? ` · ${phoneOf(active.customer)}` : ''}</div>
            {phoneOf(active.customer) ? <a className="btn btn-sm btn-secondary" href={`tel:${phoneOf(active.customer)}`} style={{ marginTop: 6 }}>Call</a> : null}
          </div>
          <div style={{ marginBottom: 10 }}>
            <strong>Address</strong>
            <div className="cell-muted">
              {active.address.line1}{active.address.line2 ? `, ${active.address.line2}` : ''}<br />
              {active.address.city}, {active.address.state} {active.address.pincode}
            </div>
            {active.address.location ? <a className="btn btn-sm btn-ghost" target="_blank" rel="noreferrer" href={`https://www.google.com/maps?q=${active.address.location.lat},${active.address.location.lng}`}>View on map</a> : null}
          </div>
          {active.scheduledAt ? <div style={{ marginBottom: 10 }}><strong>Scheduled</strong><div className="cell-muted">{new Date(active.scheduledAt).toLocaleString()}</div></div> : null}
          {active.note ? <div style={{ marginBottom: 10 }}><strong>Note</strong><div className="cell-muted">{active.note}</div></div> : null}

          {active.status === 'in_progress' && active.snapshot.priceUnit === 'per_km' && active.paymentMethod === 'cod' ? (
            <Field label={`Real distance in km (customer entered ${active.distanceKm ?? '?'} km)${Number(km) > 0 ? ` — final fare ₹${Math.round(active.snapshot.price + Math.max(0, Number(km) - (active.snapshot.includedKm ?? 0)) * (active.snapshot.perKmRate ?? 0))}` : ''}`}><input value={km} onChange={(e) => setKm(e.target.value.replace(/[^\d.]/g, ''))} inputMode="decimal" /></Field>
          ) : null}

          {active.status === 'in_progress' ? (
            <Field label={`Completion OTP for ${active.bookingNumber} (ask the customer)`}><input value={otp} onChange={(e) => setOtp(e.target.value.replace(/\D/g, '').slice(0, 4))} inputMode="numeric" placeholder="4-digit OTP" /></Field>
          ) : null}
          {FORWARD[active.status] ? (
            <div className="row-flex" style={{ marginTop: 10 }}>
              <Button disabled={busy || (active.status === 'in_progress' && otp.length !== 4)} onClick={() => advance(active)}>{FORWARD[active.status].label}</Button>
              <Button variant="ghost" onClick={() => setActive(null)}>Close</Button>
            </div>
          ) : (
            <div className="row-flex" style={{ marginTop: 10 }}><Button variant="ghost" onClick={() => setActive(null)}>Close</Button></div>
          )}
        </Modal>
      )}
    </>
  );
}

/* ------------------------------ Account ------------------------------ */
function AccountView({ me, onLogout }: { me: ProviderMe; onLogout: () => void }) {
  return (
    <>
      <div className="page-header"><div><h1 className="page-title">My account</h1><div className="page-subtitle">Your provider profile.</div></div></div>
      <div className="card" style={{ padding: 18, maxWidth: 480 }}>
        <div style={{ display: 'grid', gap: 8 }}>
          <Row label="Name" value={me.name} />
          <Row label="Phone" value={me.phone} />
          {me.email ? <Row label="Email" value={me.email} /> : null}
          {me.providerId ? <Row label="Provider ID" value={me.providerId} /> : null}
          <Row label="Status" value={me.providerStatus ?? '-'} />
          {me.providerApplication?.firm ? <Row label="Business" value={me.providerApplication.firm} /> : null}
          {me.providerApplication ? <Row label="Base" value={`${me.providerApplication.city}, ${me.providerApplication.state}`} /> : null}
        </div>
        <div style={{ marginTop: 16 }}>
          <Button variant="ghost" onClick={onLogout}><IconBell size={14} /> Log out</Button>
        </div>
      </div>
    </>
  );
}
function Row({ label, value }: { label: string; value: string }) {
  return <div style={{ display: 'flex', justifyContent: 'space-between', gap: 12 }}><span className="cell-muted">{label}</span><strong>{value}</strong></div>;
}
