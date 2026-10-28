import React, { useEffect, useState } from 'react';
import { approveProvider, fetchProviderApplications, rejectProvider } from '../api/admin';
import { getErrorMessage } from '../api/client';
import { Badge, Button, CenterSpinner, ErrorBanner, Field, Modal, formatDate } from '../components/ui';
import type { ProviderApplication } from '../types';

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

  return (
    <>
      <div className="page-header">
        <div>
          <h1 className="page-title">Provider requests</h1>
          <div className="page-subtitle">Service providers that registered on the website. Until you approve one, they cannot log in or add any services.</div>
        </div>
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
