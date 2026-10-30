import React, { useEffect, useState } from 'react';
import {
  collectProviderDues,
  fetchIntegrations,
  fetchProviderDues,
  fetchProviderWithdrawals,
  fetchSellerWithdrawals,
  markProviderDuesPayment,
  markProviderWithdrawal,
  fetchWithdrawals,
  markSellerWithdrawal,
  markWithdrawal,
  payProviderWithdrawal,
  paySellerWithdrawal,
  payWithdrawal,
  ProviderDueRow,
  ProviderTxnRow,
  SellerWithdrawal,
  Withdrawal,
} from '../api/admin';
import { getErrorMessage } from '../api/client';
import { Badge, Button, CenterSpinner, ErrorBanner, money, timeAgo } from '../components/ui';

/** Normalised view of one payout row, whether it belongs to a rider or a seller. */
interface Row {
  _id: string;
  who: string;
  phone: string;
  amount: number;
  status: 'pending' | 'paid' | 'rejected';
  method?: 'upi' | 'bank' | 'cash' | 'wallet';
  destination?: string;
  reference?: string;
  payoutId?: string;
  payoutStatus?: string;
  createdAt: string;
}

const fromRider = (w: Withdrawal): Row => ({
  ...w,
  who: typeof w.rider === 'string' ? '—' : w.rider?.name ?? '—',
  phone: typeof w.rider === 'string' ? '' : w.rider?.phone ?? '',
});
const fromSeller = (w: SellerWithdrawal): Row => ({
  ...w,
  who: typeof w.seller === 'string' ? '—' : w.seller?.name ?? '—',
  phone: typeof w.seller === 'string' ? '' : w.seller?.phone ?? '',
});
const fromProvider = (w: ProviderTxnRow): Row => ({
  ...w,
  status: w.status === 'paid' || w.status === 'rejected' ? w.status : 'pending',
  who: typeof w.provider === 'string' ? '—' : w.provider?.name ?? '—',
  phone: typeof w.provider === 'string' ? '' : w.provider?.phone ?? '',
});
type Tab = 'rider' | 'seller' | 'provider' | 'dues';
const WHOM: Record<Exclude<Tab, 'dues'>, string> = { rider: 'rider', seller: 'seller', provider: 'service provider' };

/**
 * Where you pay your riders and sellers. Each row is a withdrawal someone asked
 * for from their earnings; verify it, then pay it (one click via RazorpayX when
 * it is switched on, or mark it paid after paying by hand), or reject it.
 */
export default function PayoutsPage() {
  const [tab, setTab] = useState<Tab>('rider');
  const [status, setStatus] = useState<'pending' | 'paid' | 'rejected' | 'all'>('pending');
  const [rows, setRows] = useState<Row[]>([]);
  const [pendingTotal, setPendingTotal] = useState(0);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState<string | null>(null);
  const [error, setError] = useState('');
  const [autoPay, setAutoPay] = useState(false);

  useEffect(() => {
    fetchIntegrations().then((d) => setAutoPay(d.live.razorpayx)).catch(() => undefined);
  }, []);

  const load = () => {
    if (tab === 'dues') return;
    setLoading(true);
    const req = tab === 'rider'
      ? fetchWithdrawals(status).then(({ items, meta }) => ({ rows: items.map(fromRider), meta }))
      : tab === 'seller'
        ? fetchSellerWithdrawals(status).then(({ items, meta }) => ({ rows: items.map(fromSeller), meta }))
        : fetchProviderWithdrawals(status).then(({ items, meta }) => ({ rows: items.map(fromProvider), meta }));
    req
      .then(({ rows, meta }) => { setRows(rows); setPendingTotal(meta.pendingTotal ?? 0); setError(''); })
      .catch((e) => setError(getErrorMessage(e)))
      .finally(() => setLoading(false));
  };
  useEffect(load, [status, tab]); // eslint-disable-line react-hooks/exhaustive-deps

  const whom = tab === 'dues' ? '' : WHOM[tab];
  const doMark = (id: string, next: 'paid' | 'rejected', reference?: string) =>
    tab === 'rider' ? markWithdrawal(id, next, reference) : tab === 'seller' ? markSellerWithdrawal(id, next, reference) : markProviderWithdrawal(id, next, reference);
  const doPay = (id: string) => (tab === 'rider' ? payWithdrawal(id) : tab === 'seller' ? paySellerWithdrawal(id) : payProviderWithdrawal(id));

  const act = async (w: Row, next: 'paid' | 'rejected') => {
    let reference: string | undefined;
    if (next === 'paid') {
      reference = window.prompt(`Mark ₹${Math.round(w.amount)} to ${w.who} as paid.\n\nEnter the UPI / bank reference (optional):`) ?? undefined;
      if (reference === undefined) return; // cancelled
    } else if (!window.confirm(`Reject this ₹${Math.round(w.amount)} withdrawal? The amount goes back to the ${whom}'s balance.`)) {
      return;
    }
    setBusy(w._id);
    try { await doMark(w._id, next, reference || undefined); load(); }
    catch (e) { setError(getErrorMessage(e)); }
    finally { setBusy(null); }
  };

  const pay = async (w: Row) => {
    if (!window.confirm(`Pay ₹${Math.round(w.amount)} to ${w.who} now via RazorpayX?\n\nThe money will be sent to ${w.destination || 'their saved account'}.`)) return;
    setBusy(w._id);
    try { await doPay(w._id); load(); }
    catch (e) { setError(getErrorMessage(e)); }
    finally { setBusy(null); }
  };

  return (
    <>
      <div className="page-header">
        <div>
          <h1 className="page-title">Payouts</h1>
          <div className="page-subtitle">Pay riders, sellers and service providers the earnings they withdraw, and collect providers&apos; commission dues. Verify, then pay to the UPI / bank shown (one click with RazorpayX) or mark it paid.</div>
        </div>
      </div>

      <div className="row-flex" style={{ marginBottom: 14, gap: 8 }}>
        <button className="chip" data-active={tab === 'rider'} onClick={() => setTab('rider')}>Riders</button>
        <button className="chip" data-active={tab === 'seller'} onClick={() => setTab('seller')}>Sellers</button>
        <button className="chip" data-active={tab === 'provider'} onClick={() => setTab('provider')}>Service providers</button>
        <button className="chip" data-active={tab === 'dues'} onClick={() => setTab('dues')}>Provider commission</button>
      </div>

      {tab === 'dues' ? <ProviderDues /> : (<>

      <div className="stat-row" style={{ marginBottom: 16 }}>
        <div className="card card-pad">
          <div className="stat-label">Waiting to pay ({whom}s)</div>
          <div className="stat-value">{money(pendingTotal)}</div>
          <div className="cell-muted">Across all pending requests</div>
        </div>
      </div>

      <div className="row-flex" style={{ marginBottom: 14, gap: 8 }}>
        {(['pending', 'paid', 'rejected', 'all'] as const).map((s) => (
          <button key={s} className="chip" data-active={status === s} onClick={() => setStatus(s)} style={{ textTransform: 'capitalize' }}>{s}</button>
        ))}
      </div>

      <ErrorBanner message={error} />

      {loading ? <CenterSpinner /> : rows.length === 0 ? (
        <div className="card"><div className="empty-state">No {status === 'all' ? '' : status} {whom} withdrawals.</div></div>
      ) : (
        <div className="card">
          <div className="table-wrap">
            <table>
              <thead>
                <tr><th style={{ textTransform: 'capitalize' }}>{whom}</th><th>Amount</th><th>Pay to</th><th>Requested</th><th>Status</th><th /></tr>
              </thead>
              <tbody>
                {rows.map((w) => (
                  <tr key={w._id}>
                    <td className="cell-name">{w.who}<div className="cell-muted">{w.phone}</div></td>
                    <td className="cell-name">{money(w.amount)}</td>
                    <td className="cell-muted">
                      {w.method === 'upi' ? 'UPI' : 'Bank'}
                      <div className="cell-muted" style={{ fontSize: 12 }}>{w.destination || '—'}</div>
                    </td>
                    <td className="cell-muted">{timeAgo(w.createdAt)}</td>
                    <td>
                      <Badge tone={w.status === 'paid' ? 'success' : w.status === 'rejected' ? 'danger' : 'brand'}>{w.status}</Badge>
                      {w.reference ? <div className="cell-muted" style={{ fontSize: 12 }}>Ref: {w.reference}</div> : null}
                    </td>
                    <td>
                      {w.status === 'pending' && (
                        <div className="row-flex">
                          {autoPay && !w.payoutId && (
                            <Button size="sm" disabled={busy === w._id} onClick={() => pay(w)}>Approve &amp; Pay</Button>
                          )}
                          {w.payoutId ? (
                            <span className="cell-muted" style={{ fontSize: 12 }}>Payout {w.payoutStatus || 'processing'}…</span>
                          ) : (
                            <Button size="sm" variant={autoPay ? 'secondary' : 'primary'} disabled={busy === w._id} onClick={() => act(w, 'paid')}>Mark paid</Button>
                          )}
                          <Button size="sm" variant="ghost" disabled={busy === w._id} onClick={() => act(w, 'rejected')}>Reject</Button>
                        </div>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}
      </>)}
    </>
  );
}

/**
 * Commission service providers owe on cash bookings. A provider over the due
 * limit gets no new bookings until the money is collected: confirm a payment
 * they reported, or record cash collected at the office.
 */
function ProviderDues() {
  const [data, setData] = useState<{ providers: ProviderDueRow[]; payments: ProviderTxnRow[]; totalDue: number } | null>(null);
  const [q, setQ] = useState('');
  const [busy, setBusy] = useState('');
  const [error, setError] = useState('');

  const load = () => { fetchProviderDues(q.trim() || undefined).then((d) => { setData(d); setError(''); }).catch((e) => setError(getErrorMessage(e))); };
  useEffect(load, []); // eslint-disable-line react-hooks/exhaustive-deps

  const run = async (key: string, fn: () => Promise<void>) => {
    setBusy(key);
    try { await fn(); load(); } catch (e) { setError(getErrorMessage(e)); } finally { setBusy(''); }
  };
  const nameOf = (p: ProviderTxnRow['provider']) => (typeof p === 'object' && p ? p.name : '—');
  const phoneOf = (p: ProviderTxnRow['provider']) => (typeof p === 'object' && p ? p.phone : '');

  if (!data) return error ? <ErrorBanner message={error} /> : <CenterSpinner />;
  return (
    <>
      <ErrorBanner message={error} />
      <div className="stat-row" style={{ marginBottom: 16 }}>
        <div className="card card-pad"><div className="stat-label">Commission due (all providers)</div><div className="stat-value">{money(data.totalDue)}</div><div className="cell-muted">{data.providers.length} provider{data.providers.length === 1 ? '' : 's'}</div></div>
        <div className="card card-pad"><div className="stat-label">Payments to confirm</div><div className="stat-value">{data.payments.length}</div><div className="cell-muted">Cash / UPI the providers reported</div></div>
      </div>

      <div className="card" style={{ marginBottom: 16 }}>
        <div className="card-pad"><h2 className="card-title">Payments waiting for confirmation</h2><div className="page-subtitle">Confirm only after the money has reached you. Confirming clears the due; new bookings start again once nothing over the limit is left.</div></div>
        <div className="table-wrap">
          <table>
            <thead><tr><th>Provider</th><th>Amount</th><th>Paid by</th><th>Reported</th><th /></tr></thead>
            <tbody>
              {data.payments.length === 0 ? (
                <tr><td colSpan={5}><div className="empty-state">Nothing waiting.</div></td></tr>
              ) : data.payments.map((t) => (
                <tr key={t._id}>
                  <td className="cell-name">{nameOf(t.provider)}<div className="cell-muted">{phoneOf(t.provider)}</div></td>
                  <td className="cell-name">{money(t.amount)}</td>
                  <td className="cell-muted" style={{ textTransform: 'uppercase' }}>{t.method}{t.reference ? <div style={{ textTransform: 'none', fontSize: 12 }}>Ref: {t.reference}</div> : null}</td>
                  <td className="cell-muted">{timeAgo(t.createdAt)}</td>
                  <td>
                    <div className="row-flex">
                      <Button size="sm" disabled={busy === t._id} onClick={() => run(t._id, () => markProviderDuesPayment(t._id, 'confirmed'))}>Confirm received</Button>
                      <Button size="sm" variant="ghost" disabled={busy === t._id} onClick={() => { if (window.confirm('Reject this payment? The commission stays due.')) void run(t._id, () => markProviderDuesPayment(t._id, 'rejected')); }}>Reject</Button>
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>

      <div className="card">
        <div className="card-pad row-flex" style={{ justifyContent: 'space-between', gap: 8, flexWrap: 'wrap' }}>
          <h2 className="card-title" style={{ margin: 0 }}>Providers with commission due</h2>
          <form className="row-flex" onSubmit={(e) => { e.preventDefault(); load(); }}>
            <input value={q} onChange={(e) => setQ(e.target.value)} placeholder="Name, phone or ID" />
            <Button size="sm" variant="secondary" type="submit">Search</Button>
          </form>
        </div>
        <div className="table-wrap">
          <table>
            <thead><tr><th>Provider</th><th>Due</th><th /></tr></thead>
            <tbody>
              {data.providers.length === 0 ? (
                <tr><td colSpan={3}><div className="empty-state">No provider owes commission.</div></td></tr>
              ) : data.providers.map((p) => (
                <tr key={p._id}>
                  <td className="cell-name">{p.providerApplication?.firm || p.name}<div className="cell-muted">{p.name} · {p.phone}{p.providerId ? ` · ${p.providerId}` : ''}</div></td>
                  <td className="cell-name" style={{ color: 'var(--danger, #d33)' }}>{money(p.providerDue)}</td>
                  <td>
                    <Button size="sm" disabled={busy === p._id} onClick={() => {
                      const raw = window.prompt(`Record commission collected from ${p.name}.\n\nAmount (₹), up to ${p.providerDue}:`, String(p.providerDue));
                      if (raw === null) return;
                      const amount = Number(raw);
                      if (!amount || amount <= 0) { setError('Enter the amount you collected.'); return; }
                      void run(p._id, () => collectProviderDues(p._id, amount));
                    }}>Mark collected</Button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
    </>
  );
}
