'use client';

import React, { useEffect, useState } from 'react';
import { api } from '../lib/client';
import { useAuth } from '../context/AuthContext';
import { useToast } from '../context/ToastContext';
import { Button } from './ui';

/** "Share Autozo": a personal link anyone signed in can send out; people who join through it are counted. */
export function ShareCard() {
  const { user } = useAuth();
  const { show } = useToast();
  const [info, setInfo] = useState<{ code: string; referred: number } | null>(null);

  useEffect(() => {
    if (!user) { setInfo(null); return; }
    let live = true;
    api.get('/referral').then(({ data }) => { if (live) setInfo(data.data); }).catch(() => undefined);
    return () => { live = false; };
  }, [user]);

  if (!user || !info) return null;
  const link = `${window.location.origin}/?ref=${info.code}`;
  const text = `Order on Autozo with my link: ${link}`;

  const share = async () => {
    try {
      if (navigator.share) { await navigator.share({ title: 'Autozo', text, url: link }); return; }
    } catch (err) {
      if ((err as Error)?.name === 'AbortError') return;
    }
    copy();
  };
  const copy = async () => {
    try { await navigator.clipboard.writeText(link); show('Link copied. Send it to anyone.'); } catch { show(link); }
  };

  return (
    <section id="share" style={{ border: '1px solid var(--border)', borderRadius: 14, padding: 16, margin: '16px 0', background: 'var(--surface)' }}>
      <h2 style={{ margin: 0, fontSize: 17 }}>Share Autozo</h2>
      <p style={{ margin: '6px 0 12px', color: 'var(--text-soft)', fontSize: 14 }}>
        Your code <strong>{info.code}</strong>. {info.referred ? `${info.referred} ${info.referred === 1 ? 'person has' : 'people have'} joined with it.` : 'Anyone who signs up with it is counted as yours.'}
      </p>
      <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
        <Button onClick={share}>Share</Button>
        <Button variant="outline" onClick={copy}>Copy link</Button>
      </div>
    </section>
  );
}
