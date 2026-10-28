import React, { useState } from 'react';
import { Navigate } from '../navigation';
import { Button, ErrorBanner, Field } from '../components/ui';
import { useAuth } from '../context/AuthContext';

export default function LoginPage() {
  const { user, login } = useAuth();
  const [identifier, setIdentifier] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);
  const [kind, setKind] = useState<'admin' | 'seller' | 'provider'>('admin');
  const panelName = kind === 'seller' ? 'Warehouse Panel' : kind === 'provider' ? 'Service Provider Panel' : 'Super Admin Panel';
  const panelSub =
    kind === 'seller'
      ? 'Sign in with the warehouse login Autozo gave you to manage products, orders and riders.'
      : kind === 'provider'
        ? 'Sign in to manage your services, prices, times and bookings. New bookings ring until you accept them.'
        : 'Sign in to manage products, orders, riders and offers.';
  const nextKind = kind === 'admin' ? 'seller' : kind === 'seller' ? 'provider' : 'admin';
  const switchLabel = nextKind === 'admin' ? 'Admin sign in' : nextKind === 'seller' ? 'Warehouse sign in' : 'Service provider sign in';

  if (user) return <Navigate to="/" replace />;

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError('');
    setLoading(true);
    try {
      await login(identifier, password, kind);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Login failed');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="login-wrap">
      <form className="login-card" onSubmit={submit}>
        <div className="login-logo">
          <img className="logo-mark" src="/logo-mark.png" alt="Autozo" width={36} height={36} />
          <div className="logo-text">
            <b style={{ fontSize: 18 }}>Autozo</b>
            <span>{panelName}</span>
          </div>
        </div>
        <div className="login-sub">{panelSub}</div>
        <ErrorBanner message={error} />
        <Field label="Email or phone">
          <input
            value={identifier}
            onChange={(e) => setIdentifier(e.target.value)}
            placeholder="admin@autozo.org"
            autoFocus
            required
          />
        </Field>
        <Field label="Password">
          <input
            type="password"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            placeholder="••••••••"
            required
          />
        </Field>
        <Button type="submit" disabled={loading} style={{ width: '100%', marginTop: 6 }}>
          {loading ? 'Signing in…' : 'Sign in'}
        </Button>
        <button type="button" className="login-switch" onClick={() => { setKind(nextKind); setError(''); }}>
          {switchLabel}
        </button>
      </form>
    </div>
  );
}
