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
import s from './service.module.css';

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

  const photos = service.images ?? [];
  const current = photos[Math.min(photo, Math.max(photos.length - 1, 0))];

  return (
    <div className={`page rise ${s.wrap}`}>
      <BackButton />

      <div className={s.top}>
        <div className={s.gallery}>
          {current ? (
            // eslint-disable-next-line @next/next/no-img-element
            <img src={current} alt={service.title} className={s.main} />
          ) : (
            <div className={s.noPhoto}>{categoryName ?? 'Service'}</div>
          )}
          {photos.length > 1 ? (
            <div className={s.thumbs}>
              {photos.map((u, i) => (
                <button key={u} type="button" onClick={() => setPhoto(i)} aria-label={`Photo ${i + 1}`} className={`${s.thumb} ${i === photo ? s.thumbOn : ''}`}>
                  {/* eslint-disable-next-line @next/next/no-img-element */}
                  <img src={u} alt="" />
                </button>
              ))}
            </div>
          ) : null}
        </div>

        <div>
          {categoryName ? <span className={s.kicker}>{categoryName}</span> : null}
          <h1 className={s.title}>{service.title}</h1>
          <div className={s.meta}>
            {providerName ? `by ${providerName}` : ''}{service.city ? ` · ${service.city}` : ''}
          </div>
          <div className={s.priceRow}>
            <span className={s.price}>{priceLabel(service.price, service.priceUnit)}</span>
            {service.mrp && service.mrp > service.price ? <span className={s.mrp}>₹{service.mrp}</span> : null}
            {service.ratingCount > 0 ? <Rating value={service.rating} count={service.ratingCount} /> : null}
          </div>
          <div className={s.facts}>
            <span className={s.fact}>⏱ ~{service.durationMins} min</span>
            <span className={s.fact}>🏠 At your address</span>
            <span className={s.fact}>🔐 Completed with your OTP</span>
          </div>

          {service.description ? <p style={{ margin: '0 0 16px', whiteSpace: 'pre-wrap', lineHeight: 1.55 }}>{service.description}</p> : null}
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
      </div>

      {service.video ? (
        <section className={s.section}>
          <h2 className={s.sectionTitle}>Watch the work</h2>
          {/youtube\.com|youtu\.be/.test(service.video) ? (
            <a href={service.video} target="_blank" rel="noreferrer" style={{ fontWeight: 700 }}>Open the video on YouTube</a>
          ) : (
            <video src={service.video} controls preload="metadata" className={s.video} />
          )}
        </section>
      ) : null}

      {service.availability && service.availability.length > 0 ? (
        <section className={s.section}>
          <h2 className={s.sectionTitle}>Available hours</h2>
          <div className={s.hours}>
            {service.availability.map((a, i) => (
              <span key={i}><b>{DAYS[a.day] ?? a.day}</b> · {a.open}–{a.close}</span>
            ))}
          </div>
        </section>
      ) : null}
    </div>
  );
}
