import React, { useEffect, useState } from 'react';
import { adminCreateProvider, adminDeleteProvider, adminUpdateProvider, approveProvider, fetchProviderApplications, rejectProvider } from '../api/admin';
import { getErrorMessage } from '../api/client';
import { Badge, Button, CenterSpinner, ErrorBanner, Field, Modal, formatDate } from '../components/ui';
import type { ProviderApplication } from '../types';

const blankProvider = { name: '', phone: '', email: '', password: '', firm: '', category: '', city: '' };
const blankEdit = { name: '', phone: '', email: '', firm: '', category: '', about: '', line1: '', city: '', state: '', pincode: '', isActive: true, serviceRadiusKm: '' };

/** "Serves up to 25 km", "5-40 km (set per service)" or "Not set" - how far a provider serves. */
function areaText(a: ProviderApplication['serviceArea']): { main: string; note: string } {
  if (!a) return { main: '-', note: '' };
  if (a.radiusKm != null) return { main: `Up to ${a.radiusKm} km`, note: a.services ? `${a.services} service${a.services === 1 ? '' : 's'}` : 'No services yet' };
  if (a.services && a.minKm != null && a.maxKm != null) return { main: a.minKm === a.maxKm ? `Up to ${a.maxKm} km` : `${a.minKm}-${a.maxKm} km`, note: `${a.services} service${a.services === 1 ? '' : 's'}, radius set per service` };
  return { main: 'Not set', note: 'No services yet' };
}
const newPassword = () => `Az${Math.random().toString(36).slice(2, 8)}${Math.floor(10 + Math.random() * 89)}`;

const TABS = [
  ['pending', 'Waiting'],
  ['approved', 'Approved'],
  ['rejected', 'Rejected'],
] as const;

/** Service providers that registered themselves. Until approved they cannot log in or add services. */
export default function ProviderRequestsPage() {
  const [status, setStatus] = useState<'pending' | 'approved' | 'rejected'>('pending');
  const [rows, setRows] = useState<ProviderApplication[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [busyId, setBusyId] = useState('');
  const [rejecting, setRejecting] = useState<ProviderApplication | null>(null);
  const [reason, setReason] = useState('');
  const [creating, setCreating] = useState(false);
  const [form, setForm] = useState<typeof blankProvider>(blankProvider);
  const [created, setCreated] = useState<{ phone: string; password: string } | null>(null);
  const [editing, setEditing] = useState<ProviderApplication | null>(null);
  const [edit, setEdit] = useState<typeof blankEdit>(blankEdit);
  const [login, setLogin] = useState<ProviderApplication | null>(null);
  const [loginForm, setLoginForm] = useState({ phone: '', password: '' });
  const [notice, setNotice] = useState('');

  const load = () => {
    setLoading(true);
    fetchProviderApplications({ status, page: 1, limit: 50 })
      .then((r) => setRows(r.items))
      .catch((e) => setError(getErrorMessage(e)))
      .finally(() => setLoading(false));
  };
  useEffect(load, [status]);

  const approve = async (r: ProviderApplication) => {
    setNotice('');
    if (!window.confirm(`Approve "${r.providerApplication?.firm}"? They can then log in and add services.`)) return;
    setBusyId(r._id);
    setError('');
    try {
      await approveProvider(r._id);
      load();
    } catch (e) {
      setError(getErrorMessage(e));
    } finally {
      setBusyId('');
    }
  };

  const reject = async () => {
    if (!rejecting) return;
    setBusyId(rejecting._id);
    setError('');
    try {
      await rejectProvider(rejecting._id, reason);
      setRejecting(null);
      setReason('');
      load();
    } catch (e) {
      setError(getErrorMessage(e));
    } finally {
      setBusyId('');
    }
  };

  const startEdit = (r: ProviderApplication) => {
    const a = r.providerApplication;
    setEdit({
      name: r.name, phone: r.phone, email: r.email ?? '', firm: a?.firm ?? '', category: a?.category ?? '', about: a?.about ?? '',
      line1: a?.line1 ?? '', city: a?.city ?? '', state: a?.state ?? '', pincode: a?.pincode ?? '', isActive: r.isActive !== false,
      serviceRadiusKm: String(r.serviceArea?.radiusKm ?? r.serviceArea?.maxKm ?? ''),
    });
    setEditing(r);
  };

  const saveEdit = async () => {
    if (!editing) return;
    const km = edit.serviceRadiusKm.trim() === '' ? undefined : Number(edit.serviceRadiusKm);
    if (km !== undefined && !(km >= 1 && km <= 100)) {
      setError('Service radius must be between 1 and 100 km.');
      return;
    }
    const radiusChanged = km !== undefined && km !== (editing.serviceArea?.radiusKm ?? editing.serviceArea?.maxKm);
    setBusyId(editing._id);
    setError('');
    try {
      await adminUpdateProvider(editing._id, {
        ...(radiusChanged ? { serviceRadiusKm: km } : {}),
        name: edit.name.trim(), phone: edit.phone.trim(), email: edit.email.trim(), firm: edit.firm.trim(), category: edit.category.trim(),
        about: edit.about.trim(), line1: edit.line1.trim(), city: edit.city.trim(), state: edit.state.trim(), pincode: edit.pincode.trim(), isActive: edit.isActive,
      });
      setEditing(null);
      setNotice(`Saved ${edit.firm || edit.name}.`);
      load();
    } catch (e) {
      setError(getErrorMessage(e));
    } finally {
      setBusyId('');
    }
  };

  const startLogin = (r: ProviderApplication) => {
    setLoginForm({ phone: r.phone, password: newPassword() });
    setLogin(r);
  };

  const saveLogin = async () => {
    if (!login) return;
    setBusyId(login._id);
    setError('');
    try {
      await adminUpdateProvider(login._id, { phone: loginForm.phone.trim(), password: loginForm.password });
      setCreated({ phone: loginForm.phone.trim(), password: loginForm.password });
      setLogin(null);
      load();
    } catch (e) {
      setError(getErrorMessage(e));
    } finally {
      setBusyId('');
    }
  };

  const remove = async (r: ProviderApplication) => {
    const label = r.providerApplication?.firm || r.name;
    if (!window.confirm(`Delete provider "${label}"? Their login stops working and their services are removed from the website.`)) return;
    setBusyId(r._id);
    setError('');
    try {
      const out = await adminDeleteProvider(r._id);
      setNotice(out.kept ? `${label} was deleted. Their past bookings are kept in the records.` : `${label} was deleted.`);
      load();
    } catch (e) {
      setError(getErrorMessage(e));
    } finally {
      setBusyId('');
    }
  };

  const createProvider = async () => {
    setBusyId('create');
    setError('');
    try {
      await adminCreateProvider({
        name: form.name.trim(), phone: form.phone.trim(), email: form.email.trim() || undefined,
        password: form.password, firm: form.firm.trim(), category: form.category.trim() || undefined, city: form.city.trim() || undefined,
      });
      setCreated({ phone: form.phone.trim(), password: form.password });
      setCreating(false);
      setForm(blankProvider);
      load();
    } catch (e) {
      setError(getErrorMessage(e));
    } finally {
      setBusyId('');
    }
  };

  return (
    <>
      <div className="page-header">
        <div>
          <h1 className="page-title">Provider requests</h1>
          <div className="page-subtitle">Service providers that registered on the website. Until you approve one, they cannot log in or add any services. You can also create a provider login directly.</div>
        </div>
        <Button onClick={() => { setForm(blankProvider); setCreating(true); }}>New provider</Button>
      </div>
      <div className="row-flex" style={{ marginBottom: 14 }}>
        {TABS.map(([k, label]) => (
          <Button key={k} size="sm" variant={status === k ? 'primary' : 'secondary'} onClick={() => setStatus(k)}>
            {label}
          </Button>
        ))}
      </div>
      <ErrorBanner message={error} />
      {notice ? <div className="card card-pad" style={{ marginBottom: 12, color: 'var(--ok)', fontWeight: 600 }}>{notice}</div> : null}
      {loading ? (
        <CenterSpinner />
      ) : rows.length === 0 ? (
        <div className="card">
          <div className="empty-state">Nothing here.</div>
        </div>
      ) : (
        <div className="card">
          <div className="table-wrap">
            <table>
              <thead>
                <tr>
                  <th>Provider</th>
                  <th>Owner</th>
                  <th>Address</th>
                  <th>Service area</th>
                  <th>When</th>
                  <th />
                </tr>
              </thead>
              <tbody>
                {rows.map((r) => {
                  const a = r.providerApplication;
                  return (
                    <tr key={r._id}>
                      <td className="cell-name">
                        {a?.firm ?? '-'}
                        {a?.category ? <div className="cell-muted">{a.category}</div> : null}
                        {a?.about ? <div className="cell-muted">{a.about}</div> : null}
                      </td>
                      <td className="cell-muted">
                        {r.name}
                        <div>{r.phone} <span className="cell-muted">(login)</span></div>
                        {r.email ? <div>{r.email}</div> : null}
                      </td>
                      <td style={{ maxWidth: 320 }}>
                        {a ? `${a.line1}, ${a.city}, ${a.state} - ${a.pincode}` : '-'}
                        {a ? (
                          <div>
                            <a href={`https://www.google.com/maps?q=${a.lat},${a.lng}`} target="_blank" rel="noreferrer">
                              View on map
                            </a>
                          </div>
                        ) : null}
                      </td>
                      <td>
                        {(() => { const t = areaText(r.serviceArea); return <>{t.main}{t.note ? <div className="cell-muted">{t.note}</div> : null}</>; })()}
                      </td>
                      <td className="cell-muted">{formatDate(r.createdAt)}</td>
                      <td>
                        {r.providerStatus === 'pending' ? (
                          <div className="row-flex">
                            <Button size="sm" disabled={busyId === r._id} onClick={() => approve(r)}>
                              Approve
                            </Button>
                            <Button size="sm" variant="ghost" onClick={() => setRejecting(r)}>
                              Reject
                            </Button>
                          </div>
                        ) : r.providerStatus === 'rejected' ? (
                          <div>
                            <Badge tone="danger">Rejected</Badge>
                            {r.providerRejectReason ? <div className="cell-muted">{r.providerRejectReason}</div> : null}
                            <Button size="sm" variant="ghost" onClick={() => approve(r)}>
                              Approve anyway
                            </Button>
                          </div>
                        ) : (
                          <div className="row-flex" style={{ gap: 6 }}>
                            <Badge tone="success">Approved</Badge>
                            {r.isActive === false ? <Badge tone="danger">Blocked</Badge> : null}
                          </div>
                        )}
                        <div className="row-flex" style={{ gap: 6, marginTop: 8, flexWrap: 'wrap' }}>
                          <Button size="sm" variant="secondary" onClick={() => startEdit(r)}>Edit</Button>
                          <Button size="sm" variant="secondary" onClick={() => startLogin(r)}>Login ID</Button>
                          <Button size="sm" variant="danger" disabled={busyId === r._id} onClick={() => remove(r)}>Delete</Button>
                        </div>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {editing && (
        <Modal title={`Edit ${editing.providerApplication?.firm || editing.name}`} onClose={() => setEditing(null)}>
          <Field label="Owner name"><input value={edit.name} onChange={(e) => setEdit({ ...edit, name: e.target.value })} /></Field>
          <Field label="Business / firm name"><input value={edit.firm} onChange={(e) => setEdit({ ...edit, firm: e.target.value })} /></Field>
          <Field label="What they do"><input value={edit.category} onChange={(e) => setEdit({ ...edit, category: e.target.value })} /></Field>
          <Field label="About"><textarea rows={2} value={edit.about} onChange={(e) => setEdit({ ...edit, about: e.target.value })} /></Field>
          <div className="row-flex" style={{ gap: 10 }}>
            <Field label="Phone (login ID)"><input value={edit.phone} onChange={(e) => setEdit({ ...edit, phone: e.target.value })} inputMode="tel" /></Field>
            <Field label="Email"><input value={edit.email} onChange={(e) => setEdit({ ...edit, email: e.target.value })} /></Field>
          </div>
          <Field label="Service radius (km) - how far this provider serves, 1 to 100. Applies to all their services."><input type="number" min={1} max={100} value={edit.serviceRadiusKm} onChange={(e) => setEdit({ ...edit, serviceRadiusKm: e.target.value })} placeholder="e.g. 10" /></Field>
          <Field label="Address"><input value={edit.line1} onChange={(e) => setEdit({ ...edit, line1: e.target.value })} /></Field>
          <div className="row-flex" style={{ gap: 10 }}>
            <Field label="City"><input value={edit.city} onChange={(e) => setEdit({ ...edit, city: e.target.value })} /></Field>
            <Field label="State"><input value={edit.state} onChange={(e) => setEdit({ ...edit, state: e.target.value })} /></Field>
            <Field label="PIN"><input value={edit.pincode} onChange={(e) => setEdit({ ...edit, pincode: e.target.value.replace(/\D/g, '').slice(0, 6) })} inputMode="numeric" /></Field>
          </div>
          <label className="checkbox-row" style={{ marginTop: 6 }}>
            <input type="checkbox" checked={edit.isActive} onChange={(e) => setEdit({ ...edit, isActive: e.target.checked })} />
            <span>Active (untick to block this provider — they can’t log in or get bookings)</span>
          </label>
          <div className="row-flex" style={{ marginTop: 12 }}>
            <Button disabled={busyId === editing._id || edit.name.trim().length < 2 || edit.firm.trim().length < 2 || !/^[6-9]\d{9}$/.test(edit.phone.trim())} onClick={saveEdit}>Save</Button>
            <Button variant="ghost" onClick={() => setEditing(null)}>Cancel</Button>
          </div>
        </Modal>
      )}

      {login && (
        <Modal title={`Login for ${login.providerApplication?.firm || login.name}`} onClose={() => setLogin(null)}>
          <div className="cell-muted" style={{ marginBottom: 10 }}>The provider signs in to the provider app / panel with this phone number and password. Saving a new password signs them out of every device.</div>
          <Field label="Login ID (phone number)"><input value={loginForm.phone} onChange={(e) => setLoginForm({ ...loginForm, phone: e.target.value })} inputMode="tel" /></Field>
          <Field label="New password">
            <div className="row-flex" style={{ gap: 8 }}>
              <input value={loginForm.password} onChange={(e) => setLoginForm({ ...loginForm, password: e.target.value })} style={{ flex: 1 }} />
              <Button size="sm" variant="secondary" onClick={() => setLoginForm({ ...loginForm, password: newPassword() })}>Generate</Button>
            </div>
          </Field>
          <div className="row-flex" style={{ marginTop: 12 }}>
            <Button disabled={busyId === login._id || !/^[6-9]\d{9}$/.test(loginForm.phone.trim()) || loginForm.password.length < 6} onClick={saveLogin}>Save login</Button>
            <Button variant="ghost" onClick={() => setLogin(null)}>Cancel</Button>
          </div>
        </Modal>
      )}

      {creating && (
        <Modal title="Create a service provider" onClose={() => setCreating(false)}>
          <Field label="Owner name"><input value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} /></Field>
          <Field label="Business / firm name"><input value={form.firm} onChange={(e) => setForm({ ...form, firm: e.target.value })} /></Field>
          <Field label="What they do (optional)"><input value={form.category} onChange={(e) => setForm({ ...form, category: e.target.value })} placeholder="e.g. Plumbing" /></Field>
          <Field label="Phone (their login)"><input value={form.phone} onChange={(e) => setForm({ ...form, phone: e.target.value })} inputMode="tel" /></Field>
          <Field label="Email (optional)"><input value={form.email} onChange={(e) => setForm({ ...form, email: e.target.value })} /></Field>
          <Field label="City (optional)"><input value={form.city} onChange={(e) => setForm({ ...form, city: e.target.value })} /></Field>
          <Field label="Password (share with the provider)"><input value={form.password} onChange={(e) => setForm({ ...form, password: e.target.value })} /></Field>
          <div className="row-flex" style={{ marginTop: 12 }}>
            <Button disabled={busyId === 'create' || form.name.trim().length < 2 || form.firm.trim().length < 2 || !/^[6-9]\d{9}$/.test(form.phone.trim()) || form.password.length < 6} onClick={createProvider}>Create</Button>
            <Button variant="ghost" onClick={() => setCreating(false)}>Cancel</Button>
          </div>
        </Modal>
      )}

      {created && (
        <Modal title="Login details" onClose={() => setCreated(null)}>
          <div className="cell-muted" style={{ marginBottom: 10 }}>Share these login details with the provider. They sign in from the provider panel / app.</div>
          <Field label="Phone (login)"><input readOnly value={created.phone} /></Field>
          <Field label="Password"><input readOnly value={created.password} /></Field>
          <div className="row-flex" style={{ marginTop: 12 }}><Button onClick={() => setCreated(null)}>Done</Button></div>
        </Modal>
      )}

      {rejecting && (
        <Modal title={`Reject ${rejecting.providerApplication?.firm ?? 'registration'}`} onClose={() => setRejecting(null)}>
          <Field label="Reason (shown to the provider when they try to log in)">
            <textarea rows={3} value={reason} onChange={(e) => setReason(e.target.value)} />
          </Field>
          <div className="row-flex" style={{ marginTop: 12 }}>
            <Button disabled={busyId === rejecting._id || reason.trim().length < 3} onClick={reject}>
              Reject
            </Button>
            <Button variant="ghost" onClick={() => setRejecting(null)}>
              Cancel
            </Button>
          </div>
        </Modal>
      )}
    </>
  );
}
