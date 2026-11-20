'use client';

import Link from 'next/link';
import React, { useState } from 'react';
import { registerWarehouse } from '../../api/support';
import { INDIA_STATES } from '../../components/AddressForm';
import { Icon } from '../../components/Icon';
import { LocationPicker, PickedPlace } from '../../components/LocationPicker';
import { PasswordField } from '../../components/PasswordField';
import { FormGroup, PartnerDone, PartnerShell, partnerStyles as p } from '../../components/PartnerShell';
import { Alert, Button, Field, Input } from '../../components/ui';
import { useSettings } from '../../context/SettingsContext';
import { appDownloads } from '../../lib/apps';
import { getErrorMessage } from '../../lib/client';

const HERO = {
  kicker: 'Sell on Autozo',
  title: 'Take your shop online',
  lead: 'List your products on Autozo and sell to customers in your area. We bring the orders and the riders.',
  perks: [
    { icon: 'pin' as const, text: 'Orders from customers nearby' },
    { icon: 'truck' as const, text: 'Autozo riders deliver for you' },
    { icon: 'rupee' as const, text: 'Clear earnings & payouts' },
    { icon: 'package' as const, text: 'Easy app to add products' },
  ],
  steps: ['Fill this form', 'Autozo team approves', 'Add products & get orders'],
};

/** A warehouse registers itself here; the Autozo team approves it, then it signs in to its own panel. */
export default function WarehouseRegisterPage() {
  const [f, setF] = useState({
    name: '', phone: '', email: '', password: '', confirm: '',
    shopName: '', line1: '', city: '', state: 'Uttar Pradesh', pincode: '', gst: '', note: '',
  });
  const [location, setLocation] = useState<{ lat: number; lng: number } | undefined>();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [done, setDone] = useState('');
  const set = (k: keyof typeof f, v: string) => setF((cur) => ({ ...cur, [k]: v }));
  const apps = appDownloads(useSettings());

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
    if (f.password.length < 6) return setError('Password must be at least 6 characters.');
    if (f.password !== f.confirm) return setError('The two passwords do not match.');
    if (!location) return setError('Please mark your warehouse on the map (or tap "Use my location") so riders and customers can find it.');
    setBusy(true);
    try {
      setDone(
        await registerWarehouse({
          name: f.name.trim(),
          phone,
          email: f.email.trim() || undefined,
          password: f.password,
          shopName: f.shopName.trim(),
          line1: f.line1.trim(),
          city: f.city.trim(),
          state: f.state,
          pincode: f.pincode.trim(),
          location,
          gst: f.gst.trim() || undefined,
          note: f.note.trim() || undefined,
        }),
      );
    } catch (err) {
      setError(getErrorMessage(err));
    } finally {
      setBusy(false);
    }
  };

  if (done) {
    return (
      <PartnerShell active="warehouse" {...HERO} extra={null}>
        <PartnerDone
          title="Registration received!"
          actions={
            <>
              <a href={apps.warehouse} className="btn btn-md btn-primary"><Icon name="download" size={16} /> Download the warehouse app</a>
              <Link href="/" className="btn btn-md btn-ghost">Back to shopping</Link>
            </>
          }
        >
          {done} We will review it shortly. Once approved, sign in with your mobile number and password to add products and receive orders.
        </PartnerDone>
      </PartnerShell>
    );
  }

  return (
    <PartnerShell
      active="warehouse"
      {...HERO}
      extra={<>Already approved? <a href={apps.warehouse}>Download the warehouse app</a>.</>}
    >
      <form className={p.card} onSubmit={submit} noValidate>
        <h2 className={p.cardTitle}>Register your warehouse</h2>
        <p className={p.cardSub}>Takes about 2 minutes. Fields with * are required.</p>
        {error ? <Alert tone="bad">{error}</Alert> : null}

        <FormGroup n={1} title="Your details">
          <div className={p.row2}>
            <Field label="Your full name" required>
              <Input value={f.name} onChange={(e) => set('name', e.target.value)} autoComplete="name" required minLength={2} placeholder="e.g. Mahesh Gupta" />
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

        <FormGroup n={2} title="Your shop">
          <div className={p.row2}>
            <Field label="Warehouse / shop name" required>
              <Input value={f.shopName} onChange={(e) => set('shopName', e.target.value)} required minLength={2} placeholder="e.g. Gupta General Store" />
            </Field>
            <Field label="Email (optional)">
              <Input type="email" value={f.email} onChange={(e) => set('email', e.target.value)} autoComplete="email" placeholder="you@example.com" />
            </Field>
          </div>
          <Field label="Shop address" required>
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
          <Field label="Shop location on map" required>
            <LocationPicker value={location} onPick={picked} compact />
          </Field>
        </FormGroup>

        <FormGroup n={3} title="Optional">
          <div className={p.row2}>
            <Field label="GST number">
              <Input value={f.gst} onChange={(e) => set('gst', e.target.value.toUpperCase())} maxLength={20} placeholder="22AAAAA0000A1Z5" />
            </Field>
            <Field label="Anything else we should know">
              <Input value={f.note} onChange={(e) => set('note', e.target.value)} maxLength={500} placeholder="e.g. what you sell" />
            </Field>
          </div>
        </FormGroup>

        <p className={p.note}>The Autozo team reviews every warehouse before it goes live. You can sign in after approval.</p>
        <Button type="submit" size="lg" full loading={busy}>
          Submit for approval
        </Button>
      </form>
    </PartnerShell>
  );
}
