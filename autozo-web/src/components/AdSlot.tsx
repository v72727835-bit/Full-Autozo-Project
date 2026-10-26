'use client';

import React, { useEffect, useState } from 'react';
import { Ad, AdPlacement, fetchAds, trackAdClick } from '../api/content';

/**
 * Shows the live third-party ads for a placement (managed in the super admin).
 * Renders nothing when there are none, so it is safe to drop anywhere. Clicks
 * are recorded before the advertiser's link opens in a new tab.
 */
export default function AdSlot({ placement, className }: { placement: AdPlacement; className?: string }) {
  const [ads, setAds] = useState<Ad[]>([]);

  useEffect(() => {
    let alive = true;
    fetchAds(placement).then((list) => alive && setAds(list)).catch(() => undefined);
    return () => {
      alive = false;
    };
  }, [placement]);

  if (ads.length === 0) return null;

  const open = async (ad: Ad) => {
    const url = await trackAdClick(ad.id, ad.targetUrl);
    window.open(url, '_blank', 'noopener,noreferrer');
  };

  return (
    <div className={className} style={{ display: 'grid', gap: 12 }} aria-label="Advertisement">
      {ads.map((ad) => (
        <button
          key={ad.id}
          type="button"
          onClick={() => open(ad)}
          title={ad.title}
          style={{
            display: 'block',
            width: '100%',
            padding: 0,
            border: 'none',
            background: 'none',
            cursor: 'pointer',
            borderRadius: 14,
            overflow: 'hidden',
          }}
        >
          <img
            src={ad.image}
            alt={ad.title}
            style={{ display: 'block', width: '100%', height: 'auto', borderRadius: 14 }}
            loading="lazy"
            decoding="async"
          />
          <span style={{ display: 'block', fontSize: 11, color: 'var(--muted, #888)', textAlign: 'right', padding: '2px 4px' }}>
            Ad · {ad.title}
          </span>
        </button>
      ))}
    </div>
  );
}
