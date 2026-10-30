'use client';

import Link from 'next/link';
import { useParams, useRouter } from 'next/navigation';
import React, { useEffect, useState } from 'react';
import { AddressForm } from '../../../components/AddressForm';
import { BackButton } from '../../../components/BackButton';
import { Alert, Button, Field, PageLoader, Rating, Select, Textarea } from '../../../components/ui';
import { useAuth } from '../../../context/AuthContext';
import { getErrorMessage } from '../../../lib/client';
import { confirmBookingPayment, createBooking, fetchService, priceLabel, ServiceListing } from '../../../api/services';
import { payWithRazorpay } from '../../../lib/razorpay';

const DAYS: Record<string, string> = { sun: 'Sun', mon: 'Mon', tue: 'Tue', wed: 'Wed', thu: 'Thu', fri: 'Fri', sat: 'Sat' };

export default function ServiceDetailPage() {
  const { slug } = useParams<{ slug: string }>();
  const router = useRouter();
  const { user } = useAuth();
  const [service, setService] = useState<ServiceListing | null>(null);
  const [photo, setPhoto] = useState(0);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [booking, setBooking] = useState(false);
  const [scheduledAt, setScheduledAt] = useState('');
  const [note, setNote] = useState('');
  const [paymentMethod, setPaymentMethod] = useState<'cod' | 'online'>('cod');
  const [submitting, setSubmitting] = useState(false);
  const [bookError, setBookError] = useState('');

  useEffect(() => {
    if (!slug) return;
    setLoading(true);
    fetchService(slug)
      .then((s) => {
        setService(s);
        setError('');
      })
      .catch((e) => setError(getErrorMessage(e)))
      .finally(() => setLoading(false));
  }, [slug]);

  if (loading) return <div className="page"><PageLoader label="Loading service…" /></div>;
  if (error || !service) {
    return (
      <div className="page rise">
        <BackButton />
        <Alert tone="bad">{error || 'Service not found.'}</Alert>
      </div>
    );
  }

  const providerName = typeof service.provider === 'object' ? service.provider?.name : undefined;
  const categoryName = typeof service.category === 'object' ? service.category?.name : undefined;

  const place = async (addr: {
    name: string; phone: string; line1: string; line2?: string; landmark?: string;
    city: string; state: string; pincode: string; location?: { lat: number; lng: number };
  }) => {
    setBookError('');
    setSubmitting(true);
    try {
      const created = await createBooking({
        serviceId: service._id,
        scheduledAt: scheduledAt ? new Date(scheduledAt).toISOString() : undefined,
        note: note.trim() || undefined,
        paymentMethod,
        address: addr,
      });
      if ('requiresPayment' in created) {
        // Online: open Razorpay, then verify so providers get rung.
        const paid = await payWithRazorpay({
          keyId: created.keyId,
          orderId: created.razorpayOrderId,
          amountPaise: created.amount,
          name: addr.name,
          phone: addr.phone,
          description: `Booking for ${service.title}`,
        });
        const booking = await confirmBookingPayment(paid);
        router.push(`/bookings/${booking._id}`);
        return;
      }
      router.push(`/bookings/${created._id}`);
    } catch (e) {
      setBookError(getErrorMessage(e));
      setSubmitting(false);
    }
  };

  return (
    <div className="page rise">
      <BackButton />

      {service.images?.length ? (
        <>
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src={service.images[Math.min(photo, service.images.length - 1)]} alt={service.title} style={{ width: '100%', aspectRatio: '16/9', objectFit: 'cover', borderRadius: 14, marginTop: 8 }} />
          {service.images.length > 1 ? (
            <div style={{ display: 'flex', gap: 8, overflowX: 'auto', marginTop: 8 }}>
              {service.images.map((u, i) => (
                <button key={u} type="button" onClick={() => setPhoto(i)} aria-label={`Photo ${i + 1}`}
                  style={{ padding: 0, border: i === photo ? '2px solid var(--brand)' : '1px solid var(--line)', borderRadius: 10, background: 'none', cursor: 'pointer', flexShrink: 0 }}>
                  {/* eslint-disable-next-line @next/next/no-img-element */}
                  <img src={u} alt="" style={{ width: 64, height: 48, objectFit: 'cover', borderRadius: 8, display: 'block' }} />
                </button>
              ))}
            </div>
          ) : null}
        </>
      ) : null}

      <h1 className="h1" style={{ margin: '14px 0 4px' }}>{service.title}</h1>
      <div style={{ display: 'flex', gap: 12, alignItems: 'center', flexWrap: 'wrap' }}>
        <strong style={{ fontSize: 18 }}>{priceLabel(service.price, service.priceUnit)}</strong>
        {service.mrp && service.mrp > service.price ? <span style={{ textDecoration: 'line-through', color: '#999' }}>₹{service.mrp}</span> : null}
        {service.ratingCount > 0 ? <Rating value={service.rating} count={service.ratingCount} /> : null}
        <span className="body-sm" style={{ color: '#888' }}>~{service.durationMins} min</span>
      </div>
      <div className="body-sm" style={{ color: '#888', marginTop: 4 }}>
        {categoryName ? `${categoryName} · ` : ''}{providerName ? `by ${providerName}` : ''}{service.city ? ` · ${service.city}` : ''}
      </div>

      {service.description ? <p style={{ marginTop: 14, whiteSpace: 'pre-wrap' }}>{service.description}</p> : null}

      {service.video ? (
        <div className="card card-pad" style={{ marginTop: 14 }}>
          <strong>Watch the work</strong>
          {/youtube\.com|youtu\.be/.test(service.video) ? (
            <p className="body-sm" style={{ marginTop: 6 }}><a href={service.video} target="_blank" rel="noreferrer" style={{ fontWeight: 700 }}>Open the video on YouTube</a></p>
          ) : (
            <video src={service.video} controls preload="metadata" style={{ width: '100%', borderRadius: 12, marginTop: 8 }} />
          )}
        </div>
      ) : null}

      {service.availability && service.availability.length > 0 ? (
        <div className="card card-pad" style={{ marginTop: 14 }}>
          <strong>Available hours</strong>
          <ul style={{ margin: '8px 0 0', paddingLeft: 18 }}>
            {service.availability.map((a, i) => (
              <li key={i} className="body-sm">{DAYS[a.day] ?? a.day}: {a.open}–{a.close}</li>
            ))}
          </ul>
        </div>
      ) : null}

      <hr style={{ margin: '22px 0', border: 0, borderTop: '1px solid var(--line, #eee)' }} />

      {!user ? (
        <Alert tone="brand">
          Please <Link href={`/login?next=/services/${service.slug}`} style={{ fontWeight: 700 }}>log in</Link> to book this service.
        </Alert>
      ) : !booking ? (
        <Button size="lg" full onClick={() => setBooking(true)}>Book this service</Button>
      ) : (
        <div className="rise">
          <h2 className="h2" style={{ marginBottom: 10 }}>Book “{service.title}”</h2>
          {bookError ? <Alert tone="bad">{bookError}</Alert> : null}
          <Field label="Preferred date & time (optional)">
            <input className="input" type="datetime-local" value={scheduledAt} onChange={(e) => setScheduledAt(e.target.value)} />
          </Field>
          <Field label="Payment">
            <Select value={paymentMethod} onChange={(e) => setPaymentMethod(e.target.value as 'cod' | 'online')}>
              <option value="cod">Pay after the service (cash)</option>
              <option value="online">Pay online</option>
            </Select>
          </Field>
          <Field label="Notes for the provider (optional)">
            <Textarea value={note} onChange={(e) => setNote(e.target.value)} rows={2} maxLength={500} placeholder="Anything the provider should know" />
          </Field>
          <p className="body-sm" style={{ color: '#888', margin: '6px 0 10px' }}>Where should the provider come?</p>
          {submitting ? (
            <PageLoader label="Placing your booking…" />
          ) : (
            <AddressForm onSubmit={place} onCancel={() => setBooking(false)} />
          )}
        </div>
      )}
    </div>
  );
}
