'use client';

import Link from 'next/link';
import React, { useEffect, useMemo, useState } from 'react';
import { BackButton } from '../../components/BackButton';
import { Alert, EmptyState, Input, PageLoader, Rating } from '../../components/ui';
import { getErrorMessage } from '../../lib/client';
import {
  fetchServiceCategories,
  listServices,
  priceLabel,
  ServiceCategory,
  ServiceListing,
} from '../../api/services';

const providerName = (s: ServiceListing) => (typeof s.provider === 'object' ? s.provider?.name : undefined);

export default function ServicesPage() {
  const [categories, setCategories] = useState<ServiceCategory[]>([]);
  const [services, setServices] = useState<ServiceListing[]>([]);
  const [category, setCategory] = useState<string>('');
  const [q, setQ] = useState('');
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  useEffect(() => {
    fetchServiceCategories().then(setCategories).catch(() => undefined);
  }, []);

  useEffect(() => {
    let live = true;
    setLoading(true);
    const t = setTimeout(() => {
      listServices({ category: category || undefined, q: q.trim() || undefined, limit: 40 })
        .then((r) => {
          if (!live) return;
          setServices(r.items);
          setError('');
        })
        .catch((e) => live && setError(getErrorMessage(e)))
        .finally(() => live && setLoading(false));
    }, q ? 300 : 0);
    return () => {
      live = false;
      clearTimeout(t);
    };
  }, [category, q]);

  const chips = useMemo(
    () => [{ _id: '', name: 'All', slug: '' } as ServiceCategory, ...categories],
    [categories],
  );

  return (
    <div className="page rise">
      <BackButton />
      <h1 className="h1" style={{ margin: '12px 0 4px' }}>Services</h1>
      <p className="body-sm" style={{ marginBottom: 16 }}>
        Book trusted local professionals. A nearby provider is alerted the moment you book.
        {' '}<Link href="/provider-register" style={{ fontWeight: 700 }}>Offer your services →</Link>
      </p>

      <Input
        value={q}
        onChange={(e) => setQ(e.target.value)}
        placeholder="Search services (e.g. car wash, plumber, salon)…"
        style={{ marginBottom: 12 }}
      />

      <div style={{ display: 'flex', gap: 8, overflowX: 'auto', paddingBottom: 8, marginBottom: 16 }}>
        {chips.map((c) => (
          <button
            key={c._id || 'all'}
            onClick={() => setCategory(c._id)}
            className={`chip ${category === c._id ? 'chip-on' : ''}`}
            style={{
              whiteSpace: 'nowrap',
              padding: '8px 14px',
              borderRadius: 999,
              border: '1px solid var(--line, #e2e2e2)',
              background: category === c._id ? 'var(--brand, #0a7)' : 'transparent',
              color: category === c._id ? '#fff' : 'inherit',
              fontWeight: 600,
              cursor: 'pointer',
            }}
          >
            {c.name}
          </button>
        ))}
      </div>

      {error ? <Alert tone="bad">{error}</Alert> : null}

      {loading ? (
        <PageLoader label="Loading services…" />
      ) : services.length === 0 ? (
        <EmptyState icon="search" title="No services found" body="Try another category or search term." />
      ) : (
        <div className="service-grid" style={{ display: 'grid', gap: 14, gridTemplateColumns: 'repeat(auto-fill, minmax(260px, 1fr))' }}>
          {services.map((s) => (
            <Link key={s._id} href={`/services/${s.slug}`} className="card" style={{ overflow: 'hidden', display: 'block', textDecoration: 'none', color: 'inherit' }}>
              <div style={{ aspectRatio: '16/10', background: 'var(--muted, #f2f2f2)', overflow: 'hidden' }}>
                {s.images?.[0] ? (
                  // eslint-disable-next-line @next/next/no-img-element
                  <img src={s.images[0]} alt={s.title} style={{ width: '100%', height: '100%', objectFit: 'cover' }} />
                ) : (
                  <div style={{ width: '100%', height: '100%', display: 'grid', placeItems: 'center', color: '#999', fontSize: 13 }}>
                    {typeof s.category === 'object' ? s.category?.name : 'Service'}
                  </div>
                )}
              </div>
              <div className="card-pad" style={{ padding: 12 }}>
                <div style={{ fontWeight: 700, lineHeight: 1.3 }}>{s.title}</div>
                {providerName(s) ? <div className="body-sm" style={{ color: '#888', marginTop: 2 }}>by {providerName(s)}</div> : null}
                <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginTop: 8 }}>
                  <strong>{priceLabel(s.price, s.priceUnit)}</strong>
                  {s.ratingCount > 0 ? <Rating value={s.rating} count={s.ratingCount} /> : <span className="body-sm" style={{ color: '#aaa' }}>New</span>}
                </div>
              </div>
            </Link>
          ))}
        </div>
      )}
    </div>
  );
}
