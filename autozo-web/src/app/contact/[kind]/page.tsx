'use client';

import Link from 'next/link';
import { useParams } from 'next/navigation';
import React, { useState } from 'react';
import { sendEnquiry } from '../../../api/support';
import { getErrorMessage } from '../../../lib/client';
import { FORMS } from '../../../lib/pages';
import { BackButton } from '../../../components/BackButton';
import { Icon } from '../../../components/Icon';
import { PartnerDone, PartnerShell, partnerStyles as p } from '../../../components/PartnerShell';
import { useSettings } from '../../../context/SettingsContext';
import { appDownloads } from '../../../lib/apps';
import { Alert, Button, Field, Input, Textarea } from '../../../components/ui';
import s from '../contact.module.css';

export default function ContactPage() {
  const { kind: slug } = useParams<{ kind: string }>();
  const form = FORMS.find((f) => f.slug === slug);

  const [fullName, setFullName] = useState('');
  const [email, setEmail] = useState('');
  const [mobile, setMobile] = useState('');
  const [otherPhone, setOtherPhone] = useState('');
  const [reason, setReason] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [done, setDone] = useState('');
  const apps = appDownloads(useSettings());

  if (!form)
    return (
      <div className="page" style={{ paddingTop: 28 }}>
        <Alert tone="bad">This form does not exist.</Alert>
      </div>
    );

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError('');
    setBusy(true);
    try {
      setDone(
        await sendEnquiry({
          kind: form.kind,
          fullName: fullName.trim(),
          email: email.trim(),
          mobile: mobile.replace(/\D/g, '').replace(/^91(?=\d{10}$)/, ''),
          otherPhone: otherPhone.trim() || undefined,
          reason: reason.trim(),
        }),
      );
    } catch (err) {
      setError(getErrorMessage(err));
    } finally {
      setBusy(false);
    }
  };

  // Riders get the partner sign-up layout (tabs, perks, steps) shared with warehouses and providers.
  if (form.kind === 'delivery_partner') {
    return (
      <PartnerShell
        active="rider"
        kicker="Deliver with Autozo"
        title="Become an Autozo rider"
        lead="Deliver orders in your own area and earn every day. Leave your details and our team will call you."
        perks={[
          { icon: 'pin', text: 'Short routes near your home' },
          { icon: 'wallet', text: 'Daily earnings, clear payouts' },
          { icon: 'clock', text: 'Go online when you want' },
          { icon: 'bell', text: 'New orders ring on your phone' },
        ]}
        steps={['Fill this form', 'Our team calls you', 'Get your login & start']}
        extra={<>Already have a rider login? <a href={apps.rider}>Download the rider app</a>.</>}
      >
        {done ? (
          <PartnerDone
            title="Thanks! We got your details"
            actions={
              <>
                <a href={apps.rider} className="btn btn-md btn-primary"><Icon name="download" size={16} /> Download the rider app</a>
                <Link href="/" className="btn btn-md btn-ghost">Back to shopping</Link>
              </>
            }
          >
            {done} Our team will call you, check your documents and give you a rider login (ID and password) for the app.
          </PartnerDone>
        ) : (
          <form className={p.card} onSubmit={submit}>
            <h2 className={p.cardTitle}>Apply to deliver</h2>
            <p className={p.cardSub}>Takes 1 minute. Fields with * are required.</p>
            {error ? <Alert tone="bad">{error}</Alert> : null}
            <div className={p.row2}>
              <Field label="Full name" required>
                <Input value={fullName} onChange={(e) => setFullName(e.target.value)} autoComplete="name" placeholder="e.g. Suresh Yadav" required />
              </Field>
              <Field label="Mobile number" required>
                <Input value={mobile} onChange={(e) => setMobile(e.target.value)} inputMode="tel" autoComplete="tel" placeholder="9876543210" required />
              </Field>
            </div>
            <div className={p.row2}>
              <Field label="Email" required>
                <Input type="email" value={email} onChange={(e) => setEmail(e.target.value)} autoComplete="email" placeholder="you@example.com" required />
              </Field>
              <Field label="Other mobile number (optional)">
                <Input value={otherPhone} onChange={(e) => setOtherPhone(e.target.value)} inputMode="tel" />
              </Field>
            </div>
            <Field label="About you (vehicle, driving licence, area)" required>
              <Textarea value={reason} onChange={(e) => setReason(e.target.value)} rows={3} placeholder="e.g. I have a bike and a driving licence. I want to deliver in Robertsganj." required />
            </Field>
            <Button type="submit" size="lg" full loading={busy}>
              Submit
            </Button>
          </form>
        )}
      </PartnerShell>
    );
  }

  return (
    <div className={`page rise ${s.wrap}`}>
      <BackButton />
      <h1 className="h1" style={{ margin: '12px 0 4px' }}>
        {form.title}
      </h1>
      <p className="body-sm" style={{ marginBottom: 20 }}>
        {form.lead}
      </p>

      {done ? (
        <Alert tone="ok" icon="check-circle">
          {done}{' '}
          <Link href="/" style={{ fontWeight: 700 }}>
            Back to shopping
          </Link>
        </Alert>
      ) : (
        <form className="card card-pad" onSubmit={submit}>
          {error ? <Alert tone="bad">{error}</Alert> : null}
          <Field label="Full name" required>
            <Input value={fullName} onChange={(e) => setFullName(e.target.value)} autoComplete="name" required />
          </Field>
          <Field label="Email" required>
            <Input type="email" value={email} onChange={(e) => setEmail(e.target.value)} autoComplete="email" required />
          </Field>
          <div className="two-col">
            <Field label="Mobile number" required>
              <Input value={mobile} onChange={(e) => setMobile(e.target.value)} inputMode="tel" autoComplete="tel" placeholder="9876543210" required />
            </Field>
            <Field label="Telephone / other mobile number">
              <Input value={otherPhone} onChange={(e) => setOtherPhone(e.target.value)} inputMode="tel" />
            </Field>
          </div>
          <Field label={form.reasonLabel} required>
            <Textarea value={reason} onChange={(e) => setReason(e.target.value)} rows={4} required />
          </Field>
          <Button type="submit" size="lg" full loading={busy}>
            Submit
          </Button>
        </form>
      )}
    </div>
  );
}
