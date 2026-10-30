'use client';

import Link from 'next/link';
import { useRouter } from 'next/navigation';
import React, { useEffect, useState } from 'react';
import { BackButton } from '../../components/BackButton';
import { Alert, Badge, EmptyState, PageLoader } from '../../components/ui';
import { useAuth } from '../../context/AuthContext';
import { getErrorMessage } from '../../lib/client';
import { Booking, BookingStatus, listMyBookings } from '../../api/services';

const STATUS_TONE: Record<BookingStatus, 'ok' | 'warn' | 'bad' | 'muted'> = {
  requested: 'warn',
  accepted: 'ok',
  on_the_way: 'ok',
  in_progress: 'ok',
  completed: 'muted',
  cancelled: 'bad',
  rejected: 'bad',
  expired: 'bad',
};
const label = (s: BookingStatus) => s.replace(/_/g, ' ');

export default function BookingsPage() {
  const { user, loading: authLoading } = useAuth();
  const router = useRouter();
  const [items, setItems] = useState<Booking[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  useEffect(() => {
    if (authLoading) return;
    if (!user) {
      router.replace('/login?next=/bookings');
      return;
    }
    listMyBookings()
      .then((r) => setItems(r.items))
      .catch((e) => setError(getErrorMessage(e)))
      .finally(() => setLoading(false));
  }, [user, authLoading, router]);

  if (loading) return <div className="page"><PageLoader label="Loading your bookings…" /></div>;

  return (
    <div className="page rise">
      <BackButton />
      <h1 className="h1" style={{ margin: '12px 0 16px' }}>My bookings</h1>
      {error ? <Alert tone="bad">{error}</Alert> : null}
      {items.length === 0 ? (
        <EmptyState
          icon="clock"
          title="No bookings yet"
          body="Book a service and track it here."
          action={<Link href="/services" className="btn btn-md btn-primary">Browse services</Link>}
        />
      ) : (
        <div style={{ display: 'grid', gap: 12 }}>
          {items.map((b) => (
            <Link key={b._id} href={`/bookings/${b._id}`} className="card card-pad" style={{ display: 'block', textDecoration: 'none', color: 'inherit' }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 8 }}>
                <strong>{b.snapshot.title}</strong>
                <Badge tone={STATUS_TONE[b.status]}>{label(b.status)}</Badge>
              </div>
              <div className="body-sm" style={{ color: '#888', marginTop: 4 }}>
                {b.bookingNumber} · ₹{b.price} · {new Date(b.createdAt).toLocaleDateString()}
              </div>
              {['requested', 'accepted', 'on_the_way', 'in_progress'].includes(b.status) && b.completionOtp ? (
                <div style={{ marginTop: 8, fontSize: 13 }}>Completion OTP: <b style={{ letterSpacing: 3, color: 'var(--brand-text)' }}>{b.completionOtp}</b> <span style={{ color: '#888' }}>— give it only after the work is done</span></div>
              ) : null}
            </Link>
          ))}
        </div>
      )}
    </div>
  );
}
