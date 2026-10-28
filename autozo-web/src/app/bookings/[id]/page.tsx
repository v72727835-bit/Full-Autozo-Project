'use client';

import { useParams, useRouter } from 'next/navigation';
import React, { useEffect, useState } from 'react';
import { BackButton } from '../../../components/BackButton';
import { Alert, Badge, Button, PageLoader } from '../../../components/ui';
import { getErrorMessage } from '../../../lib/client';
import { Booking, BookingStatus, cancelBooking, fetchBooking, rateBooking } from '../../../api/services';

const STATUS_TONE: Record<BookingStatus, 'ok' | 'warn' | 'bad' | 'muted'> = {
  requested: 'warn', accepted: 'ok', on_the_way: 'ok', in_progress: 'ok',
  completed: 'muted', cancelled: 'bad', rejected: 'bad', expired: 'bad',
};
const CANCELLABLE: BookingStatus[] = ['requested', 'accepted', 'on_the_way'];
const label = (s: string) => s.replace(/_/g, ' ');

export default function BookingDetailPage() {
  const { id } = useParams<{ id: string }>();
  const router = useRouter();
  const [b, setB] = useState<Booking | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);
  const [rating, setRating] = useState(0);

  const load = () => {
    fetchBooking(id)
      .then((x) => { setB(x); setError(''); })
      .catch((e) => setError(getErrorMessage(e)))
      .finally(() => setLoading(false));
  };
  useEffect(() => { if (id) load(); /* eslint-disable-next-line react-hooks/exhaustive-deps */ }, [id]);

  // While a provider is still being found or the job is live, poll so status updates show up.
  useEffect(() => {
    if (!b) return;
    if (!['requested', 'accepted', 'on_the_way', 'in_progress'].includes(b.status)) return;
    const t = setInterval(load, 8000);
    return () => clearInterval(t);
    /* eslint-disable-next-line react-hooks/exhaustive-deps */
  }, [b?.status]);

  if (loading) return <div className="page"><PageLoader label="Loading booking…" /></div>;
  if (error || !b) return <div className="page rise"><BackButton /><Alert tone="bad">{error || 'Booking not found.'}</Alert></div>;

  const providerName = typeof b.provider === 'object' ? b.provider?.name : undefined;
  const providerPhone = typeof b.provider === 'object' ? b.provider?.phone : undefined;

  const doCancel = async () => {
    if (!confirm('Cancel this booking?')) return;
    setBusy(true);
    try { await cancelBooking(b._id); load(); } catch (e) { setError(getErrorMessage(e)); } finally { setBusy(false); }
  };
  const doRate = async () => {
    setBusy(true);
    try { await rateBooking(b._id, rating); load(); } catch (e) { setError(getErrorMessage(e)); } finally { setBusy(false); }
  };

  return (
    <div className="page rise">
      <BackButton />
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 8, margin: '12px 0 4px' }}>
        <h1 className="h1" style={{ margin: 0 }}>{b.snapshot.title}</h1>
        <Badge tone={STATUS_TONE[b.status]}>{label(b.status)}</Badge>
      </div>
      <div className="body-sm" style={{ color: '#888', marginBottom: 16 }}>{b.bookingNumber} · ₹{b.price}</div>

      {b.status === 'requested' ? <Alert tone="brand">We’re ringing nearby providers. The first to accept will take your booking.</Alert> : null}
      {b.status === 'rejected' || b.status === 'expired' ? <Alert tone="bad">No provider could take this booking. Any payment will be refunded.</Alert> : null}

      {['accepted', 'on_the_way', 'in_progress'].includes(b.status) && b.completionOtp ? (
        <div className="card card-pad" style={{ marginBottom: 14 }}>
          <strong>Completion OTP</strong>
          <p className="body-sm" style={{ margin: '4px 0 8px' }}>Share this with the provider only after the work is done — it closes the booking.</p>
          <div style={{ fontSize: 28, fontWeight: 800, letterSpacing: 6 }}>{b.completionOtp}</div>
        </div>
      ) : null}

      {providerName ? (
        <div className="card card-pad" style={{ marginBottom: 14 }}>
          <strong>Your provider</strong>
          <div className="body-sm" style={{ marginTop: 4 }}>{providerName}{providerPhone ? ` · ${providerPhone}` : ''}</div>
          {providerPhone ? <a href={`tel:${providerPhone}`} className="btn btn-sm btn-ghost" style={{ marginTop: 8 }}>Call provider</a> : null}
        </div>
      ) : null}

      <div className="card card-pad" style={{ marginBottom: 14 }}>
        <strong>Service address</strong>
        <div className="body-sm" style={{ marginTop: 4 }}>
          {b.address.name} · {b.address.phone}<br />
          {b.address.line1}{b.address.line2 ? `, ${b.address.line2}` : ''}<br />
          {b.address.city}, {b.address.state} {b.address.pincode}
        </div>
        {b.scheduledAt ? <div className="body-sm" style={{ marginTop: 8 }}>Scheduled: {new Date(b.scheduledAt).toLocaleString()}</div> : null}
        {b.note ? <div className="body-sm" style={{ marginTop: 8 }}>Note: {b.note}</div> : null}
      </div>

      {b.statusHistory && b.statusHistory.length > 0 ? (
        <div className="card card-pad" style={{ marginBottom: 14 }}>
          <strong>Timeline</strong>
          <ul style={{ margin: '8px 0 0', paddingLeft: 18 }}>
            {b.statusHistory.map((h, i) => (
              <li key={i} className="body-sm">{label(h.status)} — {new Date(h.at).toLocaleString()}{h.note ? ` (${h.note})` : ''}</li>
            ))}
          </ul>
        </div>
      ) : null}

      {CANCELLABLE.includes(b.status) ? (
        <Button variant="ghost" full onClick={doCancel} loading={busy}>Cancel booking</Button>
      ) : null}

      {b.status === 'completed' && !b.rating ? (
        <div className="card card-pad">
          <strong>Rate your experience</strong>
          <div style={{ display: 'flex', gap: 6, margin: '8px 0' }}>
            {[1, 2, 3, 4, 5].map((n) => (
              <button key={n} onClick={() => setRating(n)} style={{ fontSize: 26, background: 'none', border: 0, cursor: 'pointer', color: n <= rating ? '#f5a623' : '#ccc' }}>★</button>
            ))}
          </div>
          <Button full disabled={!rating} onClick={doRate} loading={busy}>Submit rating</Button>
        </div>
      ) : null}
    </div>
  );
}
