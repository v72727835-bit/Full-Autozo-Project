import React, { useCallback, useEffect, useState } from 'react';
import { api, getErrorMessage } from '../api/client';
import { Badge, Button, Field, Tone, money } from './ui';

type Purpose = 'rider_cash' | 'provider_dues' | 'subscription';
interface Info { enabled: boolean; payeeName?: string; upiId?: string; qrImage?: string; bankHolder?: string; bankName?: string; bankNumber?: string; bankIfsc?: string; note?: string }
interface Mine { _id: string; purpose: Purpose; amount: number; method: string; reference: string; status: 'pending' | 'confirmed' | 'rejected'; adminNote?: string }

const TONE: Record<string, Tone> = { pending: 'warn', confirmed: 'success', rejected: 'danger' };
const LABEL: Record<string, string> = { pending: 'Pending', confirmed: 'Successful', rejected: 'Rejected' };

/**
 * "Pay manually" for the provider and warehouse panels: shows the QR / UPI id / bank details the super
 * admin set, takes the transaction id after paying, and lists the payments as Pending until the office
 * confirms the money (Successful) or rejects it. Shows nothing while the admin has not switched it on.
 */
export default function ManualPay({ purpose, amount, planId, planName, onDone }: { purpose: Purpose; amount?: number; planId?: string; planName?: string; onDone?: () => void }) {
  const [info, setInfo] = useState<Info | null>(null);
  const [mine, setMine] = useState<Mine[]>([]);
  const [open, setOpen] = useState(false);
  const [method, setMethod] = useState<'upi' | 'qr' | 'bank'>('upi');
  const [ref, setRef] = useState('');
  const [asked, setAsked] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [sent, setSent] = useState(false);

  const load = useCallback(async () => {
    try {
      const [i, m] = await Promise.all([api.get('/manual-payment/info'), api.get('/manual-payment/mine')]);
      setInfo(i.data.data); setMine(m.data.data);
    } catch { /* the page still works without it */ }
  }, []);
  useEffect(() => { void load(); }, [load]);

  if (!info?.enabled) return null;
  const history = mine.filter((p) => p.purpose === purpose).slice(0, 3);
  const waiting = history.find((p) => p.status === 'pending');
  const fixed = purpose === 'subscription';
  const owed = Math.max(0, amount ?? 0);
  const pay = fixed ? owed : Number(asked) || owed;
  const canPay = !waiting && (fixed ? !!planId : owed > 0);
  if (!waiting && !canPay && !history.length && !sent) return null;

  const submit = async () => {
    setBusy(true); setError('');
    try {
      await api.post('/manual-payment', { purpose, method, reference: ref.trim(), amount: pay, ...(planId ? { planId } : {}) });
      setSent(true); setOpen(false); setRef(''); setAsked('');
      await load(); onDone?.();
    } catch (e) { setError(getErrorMessage(e)); } finally { setBusy(false); }
  };

  return (
    <div style={{ marginTop: 12, paddingTop: 12, borderTop: '1px solid var(--border, #2a2f3a)' }}>
      <div style={{ fontWeight: 700 }}>Pay by UPI / QR / bank{planName ? ` · ${planName}` : ''}</div>
      {waiting ? <div className="cell-muted">Your payment of {money(waiting.amount)} is waiting for the office to confirm.</div>
        : canPay ? <div className="cell-muted">{fixed ? `Pay ${money(owed)}` : `Pay up to ${money(owed)}`} to the account below, then send the transaction id.</div> : null}
      {sent && !waiting ? <div style={{ color: 'var(--success, #22c55e)', fontWeight: 600 }}>Sent. It stays Pending until the office confirms it.</div> : null}
      {canPay && !open ? <div style={{ marginTop: 8 }}><Button variant="secondary" onClick={() => { setOpen(true); setSent(false); }}>Pay manually</Button></div> : null}

      {open ? (
        <div style={{ marginTop: 8, display: 'grid', gap: 8 }}>
          {info.qrImage ? <img src={info.qrImage} alt="QR code" width={180} height={180} style={{ objectFit: 'contain', background: '#fff', borderRadius: 8 }} /> : null}
          {info.payeeName ? <div>Pay to: <b>{info.payeeName}</b></div> : null}
          {info.upiId ? <div>UPI id: <b>{info.upiId}</b></div> : null}
          {info.bankNumber ? <div>Bank: <b>{[info.bankHolder, info.bankName].filter(Boolean).join(' · ')}</b><br />A/c <b>{info.bankNumber}</b>{info.bankIfsc ? <> · IFSC <b>{info.bankIfsc}</b></> : null}</div> : null}
          {info.note ? <div className="cell-muted">{info.note}</div> : null}
          <Field label="Paid by">
            <select value={method} onChange={(e) => setMethod(e.target.value as 'upi' | 'qr' | 'bank')}>
              <option value="upi">UPI</option><option value="qr">QR code</option><option value="bank">Bank transfer</option>
            </select>
          </Field>
          {fixed ? <div>Amount: <b>{money(owed)}</b></div> : (
            <Field label={`Amount you paid (up to ₹${Math.floor(owed)})`}><input inputMode="decimal" value={asked} onChange={(e) => setAsked(e.target.value.replace(/[^\d.]/g, ''))} placeholder={String(owed)} /></Field>
          )}
          <Field label="Transaction id (UTR) after paying"><input value={ref} onChange={(e) => setRef(e.target.value.toUpperCase())} /></Field>
          {error ? <div style={{ color: 'var(--danger, #ef4444)' }}>{error}</div> : null}
          <div style={{ display: 'flex', gap: 8 }}>
            <Button disabled={busy || ref.trim().length < 6 || pay <= 0} onClick={submit}>{busy ? 'Sending…' : `I have paid ${money(pay)}`}</Button>
            <Button variant="ghost" onClick={() => setOpen(false)}>Cancel</Button>
          </div>
        </div>
      ) : null}

      {history.length ? (
        <div style={{ marginTop: 10, display: 'grid', gap: 6 }}>
          {history.map((p) => (
            <div key={p._id} style={{ display: 'flex', justifyContent: 'space-between', gap: 8 }}>
              <span>{money(p.amount)} · {p.method.toUpperCase()} <span className="cell-muted">{p.reference}{p.adminNote ? ` · ${p.adminNote}` : ''}</span></span>
              <Badge tone={TONE[p.status]}>{LABEL[p.status]}</Badge>
            </div>
          ))}
        </div>
      ) : null}
    </div>
  );
}
