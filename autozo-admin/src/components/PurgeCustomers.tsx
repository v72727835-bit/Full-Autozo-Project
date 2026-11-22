import React, { useEffect, useState } from 'react';
import { CustomerPurgeCounts, previewCustomerPurge, purgeAllCustomers } from '../api/admin';
import { getErrorMessage } from '../api/client';
import { Button, CenterSpinner, ErrorBanner, Field, Modal } from './ui';

const ROWS: [keyof CustomerPurgeCounts, string][] = [
  ['customers', 'Customer accounts'], ['bookings', 'Service bookings'], ['orders', 'Product orders'], ['carts', 'Carts'],
  ['reviews', 'Product reviews'], ['tickets', 'Support chats'], ['devices', 'Phones registered for notifications'],
  ['payments', 'Payment attempts'], ['stockAlerts', '"Notify me" requests'], ['alerts', 'Admin alerts about them'], ['dispatches', 'Ringing requests'],
];

/**
 * Super admin only: deletes every customer (the people who book services and order) and all their data.
 * Shows exactly what will go first, and needs DELETE typed in. Providers, riders, warehouses, admins
 * and provider earnings history are not touched.
 */
export default function PurgeCustomers({ onDone }: { onDone: () => void }) {
  const [open, setOpen] = useState(false);
  const [counts, setCounts] = useState<CustomerPurgeCounts | null>(null);
  const [result, setResult] = useState<CustomerPurgeCounts | null>(null);
  const [typed, setTyped] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');

  useEffect(() => {
    if (!open) return;
    setCounts(null); setResult(null); setTyped(''); setError('');
    previewCustomerPurge().then(setCounts).catch((e) => setError(getErrorMessage(e)));
  }, [open]);

  const run = async () => {
    setBusy(true); setError('');
    try { setResult(await purgeAllCustomers()); onDone(); } catch (e) { setError(getErrorMessage(e)); } finally { setBusy(false); }
  };

  return (
    <>
      <Button variant="danger" onClick={() => setOpen(true)}>Delete all customers</Button>
      {open ? (
        <Modal title="Delete all customers" onClose={() => !busy && setOpen(false)}>
          {error ? <ErrorBanner message={error} /> : null}
          {result ? (
            <>
              <p><strong>Done.</strong> Deleted {result.customers} customer account(s), {result.bookings} booking(s) and {result.orders} order(s).</p>
              <Button onClick={() => setOpen(false)}>Close</Button>
            </>
          ) : !counts ? (
            error ? null : <CenterSpinner />
          ) : (
            <>
              <p style={{ color: 'var(--danger, #c0392b)', fontWeight: 700 }}>This permanently deletes every customer and all their data. It cannot be undone.</p>
              <p className="cell-muted">Providers, riders, warehouses, sellers, admins and provider earnings history stay as they are.</p>
              <table className="table" style={{ margin: '10px 0' }}>
                <tbody>
                  {ROWS.map(([k, label]) => (
                    <tr key={k}><td>{label}</td><td style={{ textAlign: 'right', fontWeight: 700 }}>{counts[k]}</td></tr>
                  ))}
                </tbody>
              </table>
              <Field label='Type DELETE to confirm'>
                <input value={typed} onChange={(e) => setTyped(e.target.value)} autoComplete="off" placeholder="DELETE" />
              </Field>
              <div style={{ display: 'flex', gap: 8, marginTop: 10 }}>
                <Button variant="danger" disabled={typed !== 'DELETE' || busy || counts.customers === 0} onClick={run}>
                  {busy ? 'Deleting…' : `Delete ${counts.customers} customer(s) forever`}
                </Button>
                <Button variant="secondary" disabled={busy} onClick={() => setOpen(false)}>Cancel</Button>
              </div>
            </>
          )}
        </Modal>
      ) : null}
    </>
  );
}
