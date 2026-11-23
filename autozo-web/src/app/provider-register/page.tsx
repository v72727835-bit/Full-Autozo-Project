'use client';

import Link from 'next/link';
import React, { useEffect, useState } from 'react';
import { fetchServiceCategories, registerProvider, ServiceCategory } from '../../api/services';
import { INDIA_STATES } from '../../components/AddressForm';
import { Icon } from '../../components/Icon';
import { LocationPicker, PickedPlace } from '../../components/LocationPicker';
import { PasswordField } from '../../components/PasswordField';
import { FormGroup, PartnerDone, PartnerShell, partnerStyles as p } from '../../components/PartnerShell';
import { Alert, Button, Field, Input } from '../../components/ui';
import { useSettings } from '../../context/SettingsContext';
import { appDownloads } from '../../lib/apps';
import { getErrorMessage } from '../../lib/client';
import { PANEL_URL } from '../../lib/config';

const HERO = {
  kicker: 'Partner with autozo',
  title: 'Grow your business with autozo Services',
  lead: 'Plumber, electrician, car wash, salon, cleaning, repairs: list your services and get bookings from customers in your area.',
  perks: [
    { icon: 'pin' as const, text: 'Bookings from customers near you' },
    { icon: 'rupee' as const, text: 'Set your own prices' },
    { icon: 'clock' as const, text: 'Choose your days & timings' },
    { icon: 'bell' as const, text: 'New bookings ring on your phone' },
  ],
  steps: ['Fill this form', 'autozo team approves you', 'Add services & get bookings'],
};

/** A service provider registers itself; the Autozo team approves it, then it signs in to its own panel or app. */
export default function ProviderRegisterPage() {
  const [f, setF] = useState({
    name: '', phone: '', email: '', password: '', confirm: '',
    firm: '', category: '', line1: '', city: '', state: 'Uttar Pradesh', pincode: '', about: '',
  });
  const [location, setLocation] = useState<{ lat: number; lng: number } | undefined>();
  const [cats, setCats] = useState<ServiceCategory[]>([]);
  const [other, setOther] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [done, setDone] = useState('');
  const set = (k: keyof typeof f, v: string) => setF((cur) => ({ ...cur, [k]: v }));
  const apps = appDownloads(useSettings());

  useEffect(() => {
    fetchServiceCategories().then(setCats).catch(() => undefined);
  }, []);

  const picked = (p: PickedPlace) => {
    setLocation({ lat: p.lat, lng: p.lng });
    // The pin decides the city, state and PIN, so they follow it; the address line is only filled when still empty.
    setF((cur) => ({
      ...cur,
      city: p.city || cur.city,
      state: p.state || cur.state,
      pincode: p.pincode || cur.pincode,
      line1: cur.line1.trim() ? cur.line1 : [p.line1, p.area].filter(Boolean).join(', ') || cur.line1,
    }));
  };

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError('');
    const phone = f.phone.replace(/[\s-]/g, '').replace(/^(\+91|91)(?=\d{10}$)/, '');
    if (!/^[6-9]\d{9}$/.test(phone)) return setError('Enter a valid 10-digit mobile number (it starts with 6, 7, 8 or 9).');
    if (!f.category.trim()) return setError('Pick what kind of service you offer.');
    if (!location) return setError('Please mark your base location on the map (or tap "Use my location") so nearby customers find you first.');
    if (f.password.length < 6) return setError('Password must be at least 6 characters.');
    if (f.password !== f.confirm) return setError('The two passwords do not match.');
    setBusy(true);
    try {
      setDone(
        await registerProvider({
          name: f.name.trim(),
          phone,
          email: f.email.trim() || undefined,
          password: f.password,
          firm: f.firm.trim(),
          category: f.category.trim(),
          line1: f.line1.trim(),
          city: f.city.trim(),
          state: f.state,
          pincode: f.pincode.trim(),
          location,
          about: f.about.trim() || undefined,
        }),
      );
      window.scrollTo({ top: 0, behavior: 'smooth' });
    } catch (err) {
      setError(getErrorMessage(err));
    } finally {
      setBusy(false);
    }
  };

  if (done) {
    return (
      <PartnerShell active="provider" {...HERO}>
        <PartnerDone
          title="Registration received!"
          actions={
            <>
              <a href={apps.provider} className="btn btn-md btn-primary"><Icon name="download" size={16} /> Download the provider app</a>
              <a href={PANEL_URL} className="btn btn-md btn-outline">Open provider panel</a>
              <Link href="/services" className="btn btn-md btn-ghost">Browse services</Link>
            </>
          }
        >
          {done} We usually review new providers within a day. Once approved, sign in with your mobile number and password to add your services, prices and timings.
        </PartnerDone>
      </PartnerShell>
    );
  }

  return (
    <PartnerShell
      active="provider"
      {...HERO}
      extra={<>Already approved? <a href={PANEL_URL}>Sign in to the provider panel</a> or <a href={apps.provider}>download the app</a>.</>}
    >
      <form className={p.card} onSubmit={submit} noValidate>
        <h2 className={p.cardTitle}>Register as a service provider</h2>
        <p className={p.cardSub}>Takes about 2 minutes. Fields with * are required.</p>
        {error ? <Alert tone="bad">{error}</Alert> : null}

        <FormGroup n={1} title="Your details">
          <div className={p.row2}>
            <Field label="Full name" required>
              <Input value={f.name} onChange={(e) => set('name', e.target.value)} autoComplete="name" required minLength={2} placeholder="e.g. Ramesh Kumar" />
            </Field>
            <Field label="Mobile number (your login)" required>
              <Input value={f.phone} onChange={(e) => set('phone', e.target.value.replace(/[^\d+\s-]/g, ''))} inputMode="tel" autoComplete="tel" placeholder="9876543210" maxLength={14} required />
            </Field>
          </div>
          <div className={p.row2}>
            <Field label="Password" required>
              <PasswordField value={f.password} onChange={(v) => set('password', v)} onGenerate={(v) => set('confirm', v)} required />
            </Field>
            <Field label="Confirm password" required>
              <PasswordField id="confirm" value={f.confirm} onChange={(v) => set('confirm', v)} canGenerate={false} required />
            </Field>
          </div>
        </FormGroup>

        <FormGroup n={2} title="Your business">
          <div className={p.row2}>
            <Field label="Business / shop name" required>
              <Input value={f.firm} onChange={(e) => set('firm', e.target.value)} required minLength={2} placeholder="e.g. Kumar Plumbing Works" />
            </Field>
            <Field label="Email (optional)">
              <Input type="email" value={f.email} onChange={(e) => set('email', e.target.value)} autoComplete="email" placeholder="you@example.com" />
            </Field>
          </div>
          <span className="label" style={{ display: 'block', marginBottom: 8 }}>What service do you offer? *</span>
          <div className={p.chips}>
            {cats.map((c) => (
              <button type="button" key={c._id} className={`${p.chip} ${!other && f.category === c.name ? p.chipOn : ''}`} onClick={() => { setOther(false); set('category', c.name); }}>
                {c.name}
              </button>
            ))}
            <button type="button" className={`${p.chip} ${other ? p.chipOn : ''}`} onClick={() => { setOther(true); set('category', ''); }}>
              Other
            </button>
          </div>
          {other || cats.length === 0 ? (
            <Field label="Type your service">
              <Input value={f.category} onChange={(e) => set('category', e.target.value)} placeholder="e.g. Water tank cleaning" autoFocus={other} />
            </Field>
          ) : null}
          <Field label="About your work (optional)">
            <Input value={f.about} onChange={(e) => set('about', e.target.value)} maxLength={1000} placeholder="Years of experience, areas you cover…" />
          </Field>
        </FormGroup>

        <FormGroup n={3} title="Where you work">
          <Field label="Base address" required>
            <Input value={f.line1} onChange={(e) => set('line1', e.target.value)} required minLength={5} placeholder="Building, street, area" />
          </Field>
          <div className={p.row3}>
            <Field label="City" required>
              <Input value={f.city} onChange={(e) => set('city', e.target.value)} required autoComplete="address-level2" />
            </Field>
            <Field label="PIN code" required>
              <Input value={f.pincode} onChange={(e) => set('pincode', e.target.value.replace(/\D/g, '').slice(0, 6))} inputMode="numeric" required autoComplete="postal-code" />
            </Field>
            <Field label="State" required>
              <select className="input" value={f.state} onChange={(e) => set('state', e.target.value)} required>
                {INDIA_STATES.map((st) => (
                  <option key={st} value={st}>{st}</option>
                ))}
              </select>
            </Field>
          </div>
          <Field label="Mark your location on the map" required>
            <LocationPicker value={location} onPick={picked} compact />
          </Field>
        </FormGroup>

        <p className={p.note}>By submitting, you agree that autozo may verify your details before approving your account. You can sign in only after approval.</p>
        <Button type="submit" size="lg" full loading={busy}>
          Submit for approval
        </Button>
      </form>
    </PartnerShell>
  );
}
