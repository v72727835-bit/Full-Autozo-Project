'use client';

import React, { useEffect, useState } from 'react';
import { useParams } from 'next/navigation';
import Link from 'next/link';
import { ContentPage, fetchPage } from '../../../api/content';
import s from '../../static.module.css';

export default function Page() {
  const { slug } = useParams<{ slug: string }>();
  const [page, setPage] = useState<ContentPage | null>(null);
  const [state, setState] = useState<'loading' | 'ready' | 'missing'>('loading');

  useEffect(() => {
    let alive = true;
    setState('loading');
    fetchPage(slug)
      .then((p) => {
        if (!alive) return;
        setPage(p);
        setState(p ? 'ready' : 'missing');
      })
      .catch(() => alive && setState('missing'));
    return () => {
      alive = false;
    };
  }, [slug]);

  useEffect(() => {
    if (page) document.title = `${page.title} · Autozo`;
  }, [page]);

  if (state === 'loading') {
    return (
      <div className={`page ${s.wrap}`}>
        <p className="body-sm">Loading…</p>
      </div>
    );
  }

  if (state === 'missing' || !page) {
    return (
      <div className={`page rise ${s.wrap}`}>
        <h1 className="h1">Page not found</h1>
        <p className="body-sm" style={{ margin: '8px 0 18px' }}>
          This page isn&apos;t available. It may have been moved or unpublished.
        </p>
        <Link href="/" className="btn btn-md btn-primary">
          Back to home
        </Link>
      </div>
    );
  }

  return (
    <div className={`page rise ${s.wrap}`}>
      <h1 className="h1">{page.title}</h1>
      <article className="card card-pad" style={{ marginTop: 16 }}>
        {page.blocks.map((b, i) => {
          if (b.type === 'heading') return <h2 key={i} className="h3" style={{ marginTop: i === 0 ? 0 : 20 }}>{b.text}</h2>;
          if (b.type === 'image')
            return (
              <img
                key={i}
                src={b.image}
                alt={b.alt ?? ''}
                style={{ display: 'block', maxWidth: '100%', height: 'auto', borderRadius: 12, margin: '14px 0' }}
                loading="lazy"
                decoding="async"
              />
            );
          // Preserve the paragraph breaks the admin typed.
          return (
            <p key={i} className="body-sm" style={{ margin: '10px 0', whiteSpace: 'pre-wrap', lineHeight: 1.7 }}>
              {b.text}
            </p>
          );
        })}
      </article>
    </div>
  );
}
