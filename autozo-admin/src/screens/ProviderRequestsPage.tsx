import React, { useEffect, useState } from 'react';
import { adminCreateProvider, approveProvider, fetchProviderApplications, rejectProvider } from '../api/admin';
import { getErrorMessage } from '../api/client';
import { Badge, Button, CenterSpinner, ErrorBanner, Field, Modal, formatDate } from '../components/ui';
import type { ProviderApplication } from '../types';

const blankProvider = { name: '', phone: '', email: '', password: '', firm: '', category: '', city: '' };

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

  const load = () => {
    setLoading(true);
    fetchProviderApplications({ status, page: 1, limit: 50 })
      .then((r) => setRows(r.items))
      .catch((e) => setError(getErrorMessage(e)))
      .finally(() => setLoading(false));
  };
  useEffect(load, [status]);

  const approve = async (r: ProviderApplication) => {
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
                        <div>{r.phone}</div>
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
                          <Badge tone="success">Approved</Badge>
                        )}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </div>
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
        <Modal title="Provider created" onClose={() => setCreated(null)}>
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
