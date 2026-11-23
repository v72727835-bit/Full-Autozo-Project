"use client";

import axios from 'axios';
import React, { useEffect, useState } from 'react';
import { API_URL } from '../config';
import { payWithRazorpay } from '../lib/razorpay';
import { Button, CenterSpinner, ErrorBanner } from '../components/ui';

type State = 'loading' | 'paying' | 'done' | 'error';

/** Public Razorpay checkout opened from the native provider app. */
export default function PublicPayPage() {
  const [state, setState] = useState<State>('loading');
  const [message, setMessage] = useState('');

  const run = async () => {
    setState('loading');
    setMessage('');
    const params = new URLSearchParams(window.location.hash.replace(/^#/, ''));
    const orderId = params.get('o');
    const keyId = params.get('k');
    const amount = Number(params.get('a'));
    const token = params.get('t');
    const kind = params.get('x');

    if (!orderId || !keyId || !Number.isFinite(amount) || amount <= 0 || !token) {
      setMessage('This payment link is invalid or incomplete. Return to the autozo app and try again.');
      setState('error');
      return;
    }

    try {
      setState('paying');
      const paid = await payWithRazorpay({
        keyId,
        orderId,
        amountPaise: amount,
        name: 'autozo provider',
        description: kind === 'plan' ? 'autozo provider plan' : 'autozo payment',
      });
      const confirmPath = kind === 'booking' ? '/bookings/online/confirm' : kind === 'plan' ? '/subscription/confirm' : '/orders/online/confirm';
      await axios.post(`${API_URL}${confirmPath}`, paid, {
        headers: { Authorization: `Bearer ${token}` },
        timeout: 30000,
      });
      setState('done');
    } catch (error) {
      const apiMessage = axios.isAxiosError(error)
        ? (error.response?.data as { message?: string } | undefined)?.message
        : undefined;
      setMessage(apiMessage ?? (error instanceof Error ? error.message : 'Payment did not complete.'));
      setState('error');
    }
  };

  useEffect(() => {
    void run();
    // Start payment once when the checkout page opens.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  return (
    <main style={{ minHeight: '100svh', display: 'grid', placeItems: 'center', padding: 20, background: 'var(--bg, #f7f7f8)' }}>
      <section className="card card-pad" style={{ width: 'min(100%, 460px)', textAlign: 'center' }}>
        <img src="/logo-mark.png" alt="autozo" width={56} height={56} style={{ objectFit: 'contain', margin: '0 auto 16px' }} />
        {state === 'loading' || state === 'paying' ? (
          <><CenterSpinner /><h1 style={{ margin: '18px 0 6px' }}>Secure autozo payment</h1><p className="cell-muted">{state === 'paying' ? 'Complete payment in the Razorpay window.' : 'Preparing your payment…'}</p></>
        ) : state === 'done' ? (
          <><h1 style={{ margin: '0 0 8px' }}>Payment received</h1><p className="cell-muted">Your payment is confirmed. Return to the autozo Provider app and refresh your plan.</p></>
        ) : (
          <><h1 style={{ margin: '0 0 8px' }}>Payment could not be completed</h1><ErrorBanner message={message} /><Button onClick={() => void run()} style={{ marginTop: 16 }}>Try again</Button><p className="cell-muted" style={{ marginTop: 14 }}>If money was deducted, keep the payment ID and contact autozo support.</p></>
        )}
      </section>
    </main>
  );
}
