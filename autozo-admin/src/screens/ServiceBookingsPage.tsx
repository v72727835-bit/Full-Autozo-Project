import React, { useEffect, useState } from 'react';
import { adminServiceBookings } from '../api/admin';
import { getErrorMessage } from '../api/client';
import { Badge, Button, CenterSpinner, ErrorBanner, formatDate } from '../components/ui';
import type { BookingStatus, ServiceBookingRow } from '../types';

const TABS: [string, string][] = [
  ['', 'All'], ['requested', 'Finding provider'], ['accepted', 'Accepted'],
  ['in_progress', 'In progress'], ['completed', 'Completed'], ['cancelled', 'Cancelled'],
];
const TONE: Record<BookingStatus, 'success' | 'warn' | 'danger' | 'muted'> = {
  requested: 'warn', accepted: 'success', on_the_way: 'success', in_progress: 'success',
  completed: 'muted', cancelled: 'danger', rejected: 'danger', expired: 'danger',
};
const nameOf = (v: { name?: string } | string | undefined) => (typeof v === 'object' ? v?.name : undefined);

/** Every service booking across the platform (read-only). */
export default function ServiceBookingsPage() {
  const [status, setStatus] = useState('');
  const [rows, setRows] = useState<ServiceBookingRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  useEffect(() => {
    setLoading(true);
    adminServiceBookings({ status: status || undefined, page: 1, limit: 50 })
      .then(({ items }) => setRows(items))
      .catch((e) => setError(getErrorMessage(e)))
      .finally(() => setLoading(false));
  }, [status]);

  return (
    <>
      <div className="page-header">
        <div>
          <h1 className="page-title">Service bookings</h1>
          <div className="page-subtitle">All service bookings customers placed, and which provider is handling each.</div>
        </div>
      </div>
      <div className="row-flex" style={{ marginBottom: 14, flexWrap: 'wrap' }}>
        {TABS.map(([k, label]) => (
          <Button key={k || 'all'} size="sm" variant={status === k ? 'primary' : 'secondary'} onClick={() => setStatus(k)}>{label}</Button>
        ))}
      </div>
      <ErrorBanner message={error} />
      {loading ? (
        <CenterSpinner />
      ) : rows.length === 0 ? (
        <div className="card"><div className="empty-state">No bookings here.</div></div>
      ) : (
        <div className="card">
          <div className="table-wrap">
            <table>
              <thead><tr><th>Booking</th><th>Customer</th><th>Provider</th><th>Amount</th><th>Status</th><th>When</th></tr></thead>
              <tbody>
                {rows.map((b) => (
                  <tr key={b._id}>
                    <td className="cell-name">{b.snapshot.title}<div className="cell-muted">{b.bookingNumber}</div></td>
                    <td className="cell-muted">{nameOf(b.customer) ?? '-'}</td>
                    <td className="cell-muted">{nameOf(b.provider) ?? (b.status === 'requested' ? 'Finding…' : '-')}</td>
                    <td>₹{b.price}</td>
                    <td><Badge tone={TONE[b.status]}>{b.status.replace(/_/g, ' ')}</Badge></td>
                    <td className="cell-muted">{formatDate(b.createdAt)}</td>
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
