"use client";

import ManualPay from '../components/ManualPay';
import React, { useEffect, useState } from 'react';
import {
  ProviderTxnRow, ProviderWallet, providerPayDues, providerRequestWithdraw, providerSaveWalletAccount, providerWallet, providerWalletTxns,
} from '../api/admin';
import { getErrorMessage } from '../api/client';
import { Badge, Button, CenterSpinner, ErrorBanner, Field, money, timeAgo } from '../components/ui';

const ENTRY: Record<ProviderTxnRow['kind'], string> = {
  earning: 'Online booking',
  commission: 'Commission due (cash booking)',
  commission_paid: 'Commission paid',
  withdrawal: 'Withdrawal',
  adjustment: 'Credit from autozo',
};

/** Money in or out of the withdrawable balance (+ / −), or a due that does not touch it (blank). */
function sign(t: ProviderTxnRow): string {
  if (t.kind === 'earning' || t.kind === 'adjustment') return '+';
  if (t.kind === 'withdrawal' || (t.kind === 'commission_paid' && t.method === 'wallet')) return '−';
  return '';
}

/**
 * The provider's wallet. Online bookings are paid to Autozo, so the provider's
 * share lands here and can be withdrawn. Cash bookings are kept by the provider;
 * without a plan the commission on them is a due, and while dues are over the
 * limit no new bookings come until the office collects them.
 */
export default function ProviderWalletView() {
  const [w, setW] = useState<ProviderWallet | null>(null);
  const [rows, setRows] = useState<ProviderTxnRow[]>([]);
  const [error, setError] = useState('');
  const [note, setNote] = useState('');
  const [busy, setBusy] = useState('');
  const [amount, setAmount] = useState('');
  const [method, setMethod] = useState<'upi' | 'bank'>('upi');
  const [payMethod, setPayMethod] = useState<'wallet' | 'cash' | 'upi'>('cash');
  const [payRef, setPayRef] = useState('');
  const [acct, setAcct] = useState({ upi: '', bankHolder: '', bankNumber: '', bankIfsc: '' });

  const load = () => {
    providerWallet()
      .then((d) => {
        setW(d);
        setAcct({ upi: d.account?.upi ?? '', bankHolder: d.account?.bankHolder ?? '', bankNumber: d.account?.bankNumber ?? '', bankIfsc: d.account?.bankIfsc ?? '' });
        if (d.balance > 0) setPayMethod((m) => (m === 'cash' ? 'wallet' : m));
        setError('');
      })
      .catch((e) => setError(getErrorMessage(e)));
    providerWalletTxns({ page: 1, limit: 40 }).then(({ items }) => setRows(items)).catch(() => undefined);
  };
  useEffect(load, []);

  const run = async (key: string, fn: () => Promise<void>, done: string) => {
    setBusy(key); setNote(''); setError('');
    try { await fn(); setNote(done); load(); } catch (e) { setError(getErrorMessage(e)); } finally { setBusy(''); }
  };

  if (!w) return error ? <ErrorBanner message={error} /> : <CenterSpinner />;
  const openDue = Math.max(0, w.due - w.duePending);

  return (
    <>
      <div className="page-header">
        <div>
          <h1 className="page-title">Wallet</h1>
          <div className="page-subtitle">
            {w.hasPlan
              ? 'Your plan is running: no commission on your bookings.'
              : `No plan: autozo keeps ${w.planCommissionPct}% commission on each completed booking. Buy a plan for 0% commission.`}
          </div>
        </div>
      </div>

      {w.blocked ? (
        <div className="card card-pad" style={{ marginBottom: 14, border: '2px solid var(--danger, #d33)', background: 'rgba(221,51,51,.08)' }}>
          <strong>New bookings are stopped</strong>
          <div className="cell-muted" style={{ marginTop: 4 }}>
            You owe {money(w.due)} commission on cash bookings. Pay it below — bookings start again as soon as the office confirms it
            {w.duePending > 0 ? ` (${money(w.duePending)} is waiting for confirmation)` : ''}.
          </div>
        </div>
      ) : null}

      <ErrorBanner message={error} />
      {note && <div style={{ marginBottom: 12, padding: '10px 12px', borderRadius: 10, background: 'rgba(40,180,90,.12)', color: 'var(--ok, #1a7f43)', fontSize: 14 }}>{note}</div>}

      <div className="stat-row" style={{ marginBottom: 16 }}>
        <div className="card card-pad"><div className="stat-label">Wallet balance</div><div className="stat-value">{money(w.balance)}</div><div className="cell-muted">From online bookings</div></div>
        <div className="card card-pad"><div className="stat-label">Commission due</div><div className="stat-value" style={{ color: w.due > 0 ? 'var(--danger, #d33)' : undefined }}>{money(w.due)}</div><div className="cell-muted">{w.duePending > 0 ? `Waiting: ${money(w.duePending)}` : `Limit: ${money(w.dueLimit)}`}</div></div>
        <div className="card card-pad"><div className="stat-label">Cash you collected</div><div className="stat-value">{money(w.cashCollected)}</div><div className="cell-muted">{w.cashBookings} cash booking{w.cashBookings === 1 ? '' : 's'}</div></div>
        <div className="card card-pad"><div className="stat-label">Waiting / paid out</div><div className="stat-value">{money(w.pendingWithdraw)}</div><div className="cell-muted">Paid: {money(w.paidOut)}</div></div>
      </div>

      <div className="grid grid-2">
        <div className="card card-pad">
          <h2 className="card-title">Pay commission</h2>
          {openDue <= 0 ? (
            <div className="page-subtitle">{w.duePending > 0 ? 'Your payment is waiting for the office to confirm.' : 'Nothing due. 🎉'}</div>
          ) : (
            <>
              <div className="page-subtitle" style={{ marginBottom: 10 }}>Due now: <b>{money(openDue)}</b></div>
              <Field label="Pay by">
                <select value={payMethod} onChange={(e) => setPayMethod(e.target.value as 'wallet' | 'cash' | 'upi')}>
                  <option value="wallet" disabled={w.balance <= 0}>From my wallet ({money(w.balance)}) — instant</option>
                  <option value="cash">Cash at the autozo office</option>
                  <option value="upi">UPI to autozo</option>
                </select>
              </Field>
              {payMethod === 'upi' ? <Field label="UPI transaction id"><input value={payRef} onChange={(e) => setPayRef(e.target.value)} placeholder="e.g. 4321XXXXXXXX" /></Field> : null}
              <Button
                disabled={busy === 'due' || (payMethod === 'upi' && !payRef.trim())}
                onClick={() => run('due', () => providerPayDues({ method: payMethod, reference: payRef.trim() || undefined }),
                  payMethod === 'wallet' ? 'Commission paid from your wallet.' : 'Payment recorded. Bookings start again once the office confirms it.')}
              >{busy === 'due' ? 'Saving…' : payMethod === 'wallet' ? `Pay ${money(Math.min(openDue, w.balance))} from wallet` : `I paid ${money(openDue)}`}</Button>
            </>
          )}
          <ManualPay purpose="provider_dues" amount={openDue} onDone={load} />
        </div>

        <div className="card card-pad">
          <h2 className="card-title">Withdraw</h2>
          <div className="page-subtitle" style={{ marginBottom: 10 }}>Online-booking money only. Smallest withdrawal is {money(w.minWithdraw)}.</div>
          <Field label="Amount (₹)"><input value={amount} inputMode="numeric" onChange={(e) => setAmount(e.target.value.replace(/[^\d.]/g, ''))} placeholder={`up to ${Math.floor(w.balance)}`} /></Field>
          <Field label="Pay to">
            <select value={method} onChange={(e) => setMethod(e.target.value as 'upi' | 'bank')}>
              <option value="upi">UPI {acct.upi ? `(${acct.upi})` : ''}</option>
              <option value="bank">Bank {acct.bankNumber ? `(${acct.bankNumber})` : ''}</option>
            </select>
          </Field>
          <Button
            disabled={busy === 'wd' || w.balance < w.minWithdraw || !Number(amount)}
            onClick={() => run('wd', async () => { await providerRequestWithdraw(Number(amount), method); setAmount(''); }, 'Withdrawal requested. The autozo team will verify and pay it.')}
          >{busy === 'wd' ? 'Requesting…' : 'Request withdrawal'}</Button>
        </div>

        <div className="card card-pad">
          <h2 className="card-title">Payout account</h2>
          <Field label="UPI id"><input value={acct.upi} onChange={(e) => setAcct({ ...acct, upi: e.target.value })} placeholder="name@bank" /></Field>
          <div className="page-subtitle" style={{ margin: '4px 0 8px' }}>…or a bank account:</div>
          <Field label="Account holder name"><input value={acct.bankHolder} onChange={(e) => setAcct({ ...acct, bankHolder: e.target.value })} /></Field>
          <div className="field-row">
            <Field label="Account number"><input value={acct.bankNumber} onChange={(e) => setAcct({ ...acct, bankNumber: e.target.value })} /></Field>
            <Field label="IFSC"><input value={acct.bankIfsc} onChange={(e) => setAcct({ ...acct, bankIfsc: e.target.value.toUpperCase() })} /></Field>
          </div>
          <Button variant="secondary" disabled={busy === 'acct'}
            onClick={() => run('acct', () => providerSaveWalletAccount({ upi: acct.upi || undefined, bankHolder: acct.bankHolder || undefined, bankNumber: acct.bankNumber || undefined, bankIfsc: acct.bankIfsc || undefined }), 'Payout account saved.')}
          >{busy === 'acct' ? 'Saving…' : 'Save account'}</Button>
        </div>

        <div className="card card-pad">
          <h2 className="card-title">How your money works</h2>
          <ul className="cell-muted" style={{ margin: 0, paddingLeft: 18, lineHeight: 1.7 }}>
            <li><b>Online booking:</b> the customer pays autozo; your share{w.commissionPct ? ` (after ${w.commissionPct}% commission)` : ''} comes to this wallet when you complete the job.</li>
            <li><b>Cash booking:</b> you keep the cash.{w.commissionPct ? ` The ${w.commissionPct}% commission is added to “Commission due”.` : ' With your plan there is no commission.'}</li>
            <li>When commission due goes over {money(w.dueLimit)}, new bookings stop until the office confirms your payment.</li>
          </ul>
        </div>
      </div>

      <div className="card" style={{ marginTop: 16 }}>
        <div className="card-pad"><h2 className="card-title">Passbook</h2></div>
        <div className="table-wrap">
          <table>
            <thead><tr><th>Entry</th><th>Amount</th><th>Status</th><th>When</th></tr></thead>
            <tbody>
              {rows.length === 0 ? (
                <tr><td colSpan={4}><div className="empty-state">No entries yet. They appear here when you complete bookings.</div></td></tr>
              ) : rows.map((t) => (
                <tr key={t._id}>
                  <td className="cell-name">
                    {ENTRY[t.kind]}{t.kind === 'commission_paid' && t.method ? ` · ${t.method}` : ''}
                    <div className="cell-muted">
                      {t.note || ''}
                      {t.gross != null ? ` · booking ${money(t.gross)}, commission ${money(t.commission ?? 0)}` : ''}
                      {t.reference ? ` · ref ${t.reference}` : ''}
                    </div>
                  </td>
                  <td className="cell-name" style={{ color: t.kind === 'commission' ? 'var(--danger, #d33)' : undefined }}>{sign(t)}{money(t.amount)}</td>
                  <td><Badge tone={t.status === 'paid' || t.status === 'completed' || t.status === 'confirmed' ? 'success' : t.status === 'rejected' ? 'danger' : 'brand'}>{t.status}</Badge></td>
                  <td className="cell-muted">{timeAgo(t.createdAt)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
    </>
  );
}
