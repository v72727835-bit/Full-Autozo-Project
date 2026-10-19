import React, { useEffect, useState } from 'react';
import { fetchIntegrations, fetchWithdrawals, markWithdrawal, payWithdrawal, Withdrawal } from '../api/admin';
import { getErrorMessage } from '../api/client';
import { Badge, Button, CenterSpinner, ErrorBanner, money, timeAgo } from '../components/ui';

const riderName = (w: Withdrawal) => (typeof w.rider === 'string' ? '—' : w.rider?.name ?? '—');
const riderPhone = (w: Withdrawal) => (typeof w.rider === 'string' ? '' : w.rider?.phone ?? '');

/**
 * Where you pay your riders. Each row is a withdrawal a rider asked for from
 * their earnings wallet; pay it to their UPI / bank, then mark it paid with a
 * reference, or reject it if something is wrong.
 */
export default function PayoutsPage() {
  const [status, setStatus] = useState<'pending' | 'paid' | 'rejected' | 'all'>('pending');
  const [rows, setRows] = useState<Withdrawal[]>([]);
  const [pendingTotal, setPendingTotal] = useState(0);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState<string | null>(null);
  const [error, setError] = useState('');
  const [autoPay, setAutoPay] = useState(false);

  useEffect(() => {
    fetchIntegrations().then((d) => setAutoPay(d.live.razorpayx)).catch(() => undefined);
  }, []);

  const load = () => {
    setLoading(true);
    fetchWithdrawals(status)
      .then(({ items, meta }) => { setRows(items); setPendingTotal(meta.pendingTotal ?? 0); setError(''); })
      .catch((e) => setError(getErrorMessage(e)))
      .finally(() => setLoading(false));
  };
  useEffect(load, [status]); // eslint-disable-line react-hooks/exhaustive-deps

  const act = async (w: Withdrawal, next: 'paid' | 'rejected') => {
    let reference: string | undefined;
    if (next === 'paid') {
      reference = window.prompt(`Mark ₹${Math.round(w.amount)} to ${riderName(w)} as paid.\n\nEnter the UPI / bank reference (optional):`) ?? undefined;
      if (reference === undefined) return; // cancelled
    } else if (!window.confirm(`Reject this ₹${Math.round(w.amount)} withdrawal? The amount goes back to the rider's balance.`)) {
      return;
    }
    setBusy(w._id);
    try { await markWithdrawal(w._id, next, reference || undefined); load(); }
    catch (e) { setError(getErrorMessage(e)); }
    finally { setBusy(null); }
  };

  const pay = async (w: Withdrawal) => {
    if (!window.confirm(`Pay ₹${Math.round(w.amount)} to ${riderName(w)} now via RazorpayX?\n\nThe money will be sent to ${w.destination || 'their saved account'}.`)) return;
    setBusy(w._id);
    try { await payWithdrawal(w._id); load(); }
    catch (e) { setError(getErrorMessage(e)); }
    finally { setBusy(null); }
  };

  return (
    <>
      <div className="page-header">
        <div>
          <h1 className="page-title">Rider payouts</h1>
          <div className="page-subtitle">Pay your riders the earnings they withdraw. Pay to the UPI / bank shown, then mark it paid.</div>
        </div>
      </div>

      <div className="stat-row" style={{ marginBottom: 16 }}>
        <div className="card card-pad">
          <div className="stat-label">Waiting to pay</div>
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
        <div className="card"><div className="empty-state">No {status === 'all' ? '' : status} withdrawals.</div></div>
      ) : (
        <div className="card">
          <div className="table-wrap">
            <table>
              <thead>
                <tr><th>Rider</th><th>Amount</th><th>Pay to</th><th>Requested</th><th>Status</th><th /></tr>
              </thead>
              <tbody>
                {rows.map((w) => (
                  <tr key={w._id}>
                    <td className="cell-name">{riderName(w)}<div className="cell-muted">{riderPhone(w)}</div></td>
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
    </>
  );
}
