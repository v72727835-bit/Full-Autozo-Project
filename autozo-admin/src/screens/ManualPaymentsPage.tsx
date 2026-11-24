import React, { useEffect, useState } from 'react';
import {
  confirmManualPayment, fetchManualConfig, fetchManualPayments, ManualPaymentConfig, ManualPaymentRow,
  rejectManualPayment, saveManualConfig, uploadImages,
} from '../api/admin';
import { getErrorMessage } from '../api/client';
import { Badge, Button, Card, CenterSpinner, ErrorBanner, Field, Tabs, Tone, formatDate, money } from '../components/ui';

const PURPOSE: Record<string, string> = { rider_cash: 'Rider cash', provider_dues: 'Provider commission', subscription: 'Plan' };
const ROLE: Record<string, string> = { rider: 'Rider', provider: 'Service provider', seller: 'Warehouse' };
const TONE: Record<string, Tone> = { pending: 'warn', confirmed: 'success', rejected: 'danger' };
const LABEL: Record<string, string> = { pending: 'Pending', confirmed: 'Successful', rejected: 'Rejected' };

/**
 * Manual payments: the super admin puts a QR picture, UPI id and bank details here; riders, service
 * providers and warehouses see them in their panel / app, pay outside the app and send the transaction
 * id. Each one waits here as Pending until the admin confirms the money arrived (then it shows
 * Successful to the partner and the dues / plan are applied) or rejects it.
 */
export default function ManualPaymentsPage() {
  const [cfg, setCfg] = useState<ManualPaymentConfig | null>(null);
  const [rows, setRows] = useState<ManualPaymentRow[] | null>(null);
  const [status, setStatus] = useState<string>('pending');
  const [error, setError] = useState('');
  const [msg, setMsg] = useState('');
  const [busy, setBusy] = useState('');

  const loadRows = () => fetchManualPayments(status || undefined).then((r) => setRows(r.rows)).catch((e) => setError(getErrorMessage(e)));
  useEffect(() => { fetchManualConfig().then(setCfg).catch((e) => setError(getErrorMessage(e))); }, []);
  useEffect(() => { setRows(null); loadRows(); /* eslint-disable-next-line react-hooks/exhaustive-deps */ }, [status]);

  const set = <K extends keyof ManualPaymentConfig>(k: K, v: ManualPaymentConfig[K]) => setCfg((c) => (c ? { ...c, [k]: v } : c));

  const save = async () => {
    if (!cfg) return;
    setBusy('save'); setError(''); setMsg('');
    try { setCfg(await saveManualConfig(cfg)); setMsg('Saved. Riders, service providers and warehouses can see these details now.'); }
    catch (e) { setError(getErrorMessage(e)); } finally { setBusy(''); }
  };
  const upload = async (file?: File) => {
    if (!file) return;
    setBusy('qr'); setError('');
    try { const [url] = await uploadImages([file]); set('qrImage', url); } catch (e) { setError(getErrorMessage(e)); } finally { setBusy(''); }
  };
  const decide = async (r: ManualPaymentRow, ok: boolean) => {
    const reason = ok ? undefined : window.prompt('Why was it not received? (optional, the partner is told)') ?? undefined;
    if (!ok && reason === undefined) return;
    setBusy(r._id); setError('');
    try { ok ? await confirmManualPayment(r._id) : await rejectManualPayment(r._id, reason || undefined); await loadRows(); }
    catch (e) { setError(getErrorMessage(e)); } finally { setBusy(''); }
  };

  return (
    <>
      <div className="page-header">
        <div>
          <h1 className="page-title">Manual payments</h1>
          <div className="page-subtitle">Show your QR, UPI id and bank details to riders, service providers and warehouses, and confirm what they send.</div>
        </div>
      </div>
      {error ? <ErrorBanner message={error} /> : null}

      <Card title="Where partners should pay">
        {!cfg ? <CenterSpinner /> : (
          <>
            <label style={{ display: 'flex', gap: 8, alignItems: 'center', marginBottom: 12 }}>
              <input type="checkbox" checked={cfg.enabled} onChange={(e) => set('enabled', e.target.checked)} />
              <b>Manual payment is ON</b> <span className="cell-muted">(shown in the rider / provider / warehouse panels and apps)</span>
            </label>
            <div className="field-row">
              <Field label="Payee name"><input value={cfg.payeeName ?? ''} onChange={(e) => set('payeeName', e.target.value)} placeholder="autozo Retail Pvt Ltd" /></Field>
              <Field label="UPI id"><input value={cfg.upiId ?? ''} onChange={(e) => set('upiId', e.target.value.trim())} placeholder="autozo@upi" /></Field>
            </div>
            <div className="field-row">
              <Field label="Bank account holder"><input value={cfg.bankHolder ?? ''} onChange={(e) => set('bankHolder', e.target.value)} /></Field>
              <Field label="Bank name"><input value={cfg.bankName ?? ''} onChange={(e) => set('bankName', e.target.value)} /></Field>
            </div>
            <div className="field-row">
              <Field label="Account number"><input inputMode="numeric" value={cfg.bankNumber ?? ''} onChange={(e) => set('bankNumber', e.target.value.replace(/\D/g, ''))} /></Field>
              <Field label="IFSC"><input value={cfg.bankIfsc ?? ''} onChange={(e) => set('bankIfsc', e.target.value.toUpperCase())} placeholder="SBIN0001234" /></Field>
            </div>
            <Field label="Message for partners (optional)"><input value={cfg.note ?? ''} onChange={(e) => set('note', e.target.value)} placeholder="Send the transaction id after paying" /></Field>
            <Field label="QR code picture">
              <div style={{ display: 'flex', gap: 14, alignItems: 'center', flexWrap: 'wrap' }}>
                {cfg.qrImage ? <img src={cfg.qrImage} alt="QR" width={120} height={120} style={{ objectFit: 'contain', background: '#fff', borderRadius: 8, padding: 4 }} /> : <span className="cell-muted">No QR yet</span>}
                <input type="file" accept="image/*" disabled={busy === 'qr'} onChange={(e) => upload(e.target.files?.[0])} />
                {cfg.qrImage ? <Button variant="ghost" onClick={() => set('qrImage', '')}>Remove</Button> : null}
              </div>
            </Field>
            {msg ? <div className="cell-muted" style={{ margin: '8px 0' }}>{msg}</div> : null}
            <Button onClick={save} disabled={busy === 'save'}>{busy === 'save' ? 'Saving…' : 'Save details'}</Button>
          </>
        )}
      </Card>

      <div style={{ height: 18 }} />
      <Tabs value={status} onChange={setStatus} options={[{ value: 'pending', label: 'Pending' }, { value: 'confirmed', label: 'Successful' }, { value: 'rejected', label: 'Rejected' }, { value: '', label: 'All' }]} />
      {!rows ? <CenterSpinner /> : rows.length === 0 ? (
        <Card><div className="empty-state">{status === 'pending' ? 'Nothing is waiting for you.' : 'No payments here yet.'}</div></Card>
      ) : (
        <div className="table-wrap">
          <table className="table">
            <thead><tr><th>From</th><th>For</th><th>Amount</th><th>Transaction id</th><th>Sent</th><th>Status</th><th /></tr></thead>
            <tbody>
              {rows.map((r) => (
                <tr key={r._id}>
                  <td><b>{r.user?.name ?? '—'}</b><div className="cell-muted">{ROLE[r.role]} · {r.user?.phone}</div></td>
                  <td>{PURPOSE[r.purpose]}{r.planName ? ` · ${r.planName}` : ''}</td>
                  <td><b>{money(r.amount)}</b><div className="cell-muted">{r.method.toUpperCase()}</div></td>
                  <td>{r.reference}{r.proof ? <div><a href={r.proof} target="_blank" rel="noreferrer">Screenshot</a></div> : null}{r.note ? <div className="cell-muted">{r.note}</div> : null}</td>
                  <td className="cell-muted">{formatDate(r.createdAt)}</td>
                  <td><Badge tone={TONE[r.status]}>{LABEL[r.status]}</Badge>{r.adminNote ? <div className="cell-muted">{r.adminNote}</div> : null}</td>
                  <td style={{ whiteSpace: 'nowrap' }}>
                    {r.status === 'pending' ? (
                      <>
                        <Button size="sm" disabled={busy === r._id} onClick={() => decide(r, true)}>Money received</Button>{' '}
                        <Button size="sm" variant="danger" disabled={busy === r._id} onClick={() => decide(r, false)}>Not received</Button>
                      </>
                    ) : null}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </>
  );
}
