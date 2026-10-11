import React, { useEffect, useState } from 'react';
import { fetchIntegrations, IntegrationsView, saveIntegrations, testRazorpayKeys } from '../api/admin';
import { getErrorMessage } from '../api/client';
import { Badge, Button, CenterSpinner, ErrorBanner, Field } from '../components/ui';

/**
 * Keys for "Continue with Google / Facebook" and for online payment (Razorpay),
 * typed here instead of on the server. Secrets are stored encrypted and are never
 * shown again: a saved secret only says "saved", and a new one replaces it.
 */
export default function IntegrationsPage() {
  const [data, setData] = useState<IntegrationsView | null>(null);
  const [error, setError] = useState('');
  const [note, setNote] = useState('');
  const [busy, setBusy] = useState('');

  const [google, setGoogle] = useState('');
  const [fbId, setFbId] = useState('');
  const [fbSecret, setFbSecret] = useState('');
  const [rzId, setRzId] = useState('');
  const [rzSecret, setRzSecret] = useState('');
  const [rzOn, setRzOn] = useState(true);

  const apply = (d: IntegrationsView) => {
    setData(d);
    setGoogle(d.googleClientId);
    setFbId(d.facebookAppId);
    setRzId(d.razorpayKeyId);
    setRzOn(d.razorpayEnabled);
    setFbSecret('');
    setRzSecret('');
  };

  useEffect(() => {
    fetchIntegrations().then(apply).catch((e) => setError(getErrorMessage(e)));
  }, []);

  const save = async (which: string, body: Record<string, unknown>, done: string) => {
    setBusy(which);
    setError('');
    setNote('');
    try {
      apply(await saveIntegrations(body));
      setNote(done);
    } catch (e) {
      setError(getErrorMessage(e));
    } finally {
      setBusy('');
    }
  };

  const test = async () => {
    setBusy('test');
    setError('');
    setNote('');
    try {
      setNote(await testRazorpayKeys());
    } catch (e) {
      setError(getErrorMessage(e));
    } finally {
      setBusy('');
    }
  };

  if (!data) return error ? <ErrorBanner message={error} /> : <CenterSpinner />;

  const status = (on: boolean) => (on ? <Badge tone="success">Working</Badge> : <Badge tone="muted">Not set up</Badge>);

  return (
    <>
      <div className="page-header">
        <div>
          <h1 className="page-title">Login &amp; Payments</h1>
          <div className="page-subtitle">
            Add your keys here and they start working on the website and the app within a few seconds. No server change is needed. Secrets are stored encrypted and are never shown again.
          </div>
        </div>
      </div>
      <ErrorBanner message={error} />
      {note && <div className="badge badge-success" style={{ marginBottom: 12 }}>{note}</div>}

      <div className="card card-pad" style={{ marginBottom: 16 }}>
        <h2 className="card-title">
          Continue with Gmail {status(data.live.google)}
        </h2>
        <div className="page-subtitle" style={{ marginBottom: 12 }}>
          Google Cloud Console → APIs &amp; Services → Credentials → OAuth client ID (Web). Add https://shop.autozo.org as an authorised JavaScript origin.
        </div>
        <Field label="Google Client ID">
          <input value={google} onChange={(e) => setGoogle(e.target.value)} placeholder="1234567890-abc.apps.googleusercontent.com" />
        </Field>
        <div className="modal-actions">
          <Button disabled={busy === 'google'} onClick={() => save('google', { googleClientId: google }, 'Google login saved.')}>
            {busy === 'google' ? 'Saving…' : 'Save Google'}
          </Button>
        </div>
      </div>

      <div className="card card-pad" style={{ marginBottom: 16 }}>
        <h2 className="card-title">
          Continue with Facebook {status(data.live.facebook)}
        </h2>
        <div className="page-subtitle" style={{ marginBottom: 12 }}>
          developers.facebook.com → your app → Settings → Basic. Turn on Facebook Login and add https://shop.autozo.org as a valid domain.
        </div>
        <div className="field-row">
          <Field label="Facebook App ID">
            <input value={fbId} onChange={(e) => setFbId(e.target.value)} placeholder="1234567890123456" />
          </Field>
          <Field label={data.facebookSecretSaved ? 'App Secret (saved - type a new one to replace)' : 'App Secret'}>
            <input type="password" value={fbSecret} onChange={(e) => setFbSecret(e.target.value)} placeholder={data.facebookSecretSaved ? '••••••••••••' : ''} autoComplete="off" />
          </Field>
        </div>
        <div className="modal-actions">
          {data.facebookSecretSaved && (
            <Button variant="ghost" disabled={!!busy} onClick={() => save('fbclear', { clearFacebookSecret: true }, 'Facebook secret removed.')}>
              Remove saved secret
            </Button>
          )}
          <Button disabled={busy === 'fb'} onClick={() => save('fb', { facebookAppId: fbId, ...(fbSecret ? { facebookAppSecret: fbSecret } : {}) }, 'Facebook login saved.')}>
            {busy === 'fb' ? 'Saving…' : 'Save Facebook'}
          </Button>
        </div>
      </div>

      <div className="card card-pad">
        <h2 className="card-title">
          Online payment (Razorpay) {status(data.live.razorpay)}
        </h2>
        <div className="page-subtitle" style={{ marginBottom: 12 }}>
          dashboard.razorpay.com → Account &amp; Settings → API Keys. Use test keys (rzp_test_…) first, then switch to live keys (rzp_live_…) when you are ready.
        </div>
        <div className="field-row">
          <Field label="Razorpay Key ID">
            <input value={rzId} onChange={(e) => setRzId(e.target.value)} placeholder="rzp_test_xxxxxxxxxxxxxx" />
          </Field>
          <Field label={data.razorpaySecretSaved ? 'Key Secret (saved - type a new one to replace)' : 'Key Secret'}>
            <input type="password" value={rzSecret} onChange={(e) => setRzSecret(e.target.value)} placeholder={data.razorpaySecretSaved ? '••••••••••••' : ''} autoComplete="off" />
          </Field>
        </div>
        <label className="checkbox-row" style={{ marginBottom: 8 }}>
          <input type="checkbox" checked={rzOn} onChange={(e) => setRzOn(e.target.checked)} />
          <span>Show “Pay online” at checkout</span>
        </label>
        <div className="modal-actions">
          <Button variant="secondary" disabled={busy === 'test'} onClick={test}>
            {busy === 'test' ? 'Checking…' : 'Test saved keys'}
          </Button>
          {data.razorpaySecretSaved && (
            <Button variant="ghost" disabled={!!busy} onClick={() => save('rzclear', { clearRazorpaySecret: true }, 'Razorpay secret removed.')}>
              Remove saved secret
            </Button>
          )}
          <Button
            disabled={busy === 'rz'}
            onClick={() => save('rz', { razorpayKeyId: rzId, razorpayEnabled: rzOn, ...(rzSecret ? { razorpayKeySecret: rzSecret } : {}) }, 'Razorpay saved. Press “Test saved keys” to check them.')}
          >
            {busy === 'rz' ? 'Saving…' : 'Save Razorpay'}
          </Button>
        </div>
      </div>
    </>
  );
}
