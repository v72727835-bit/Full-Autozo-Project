'use client';

import Image from 'next/image';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import React, { useEffect, useRef, useState } from 'react';
import { fetchCategoryTree, listProducts, suggestProducts } from '../api/catalog';
import { fitClass } from '../lib/art';
import { Product } from '../lib/types';
import { Icon } from './Icon';
import { Spinner } from './ui';
import s from './SearchBar.module.css';
import { smallPhoto } from '../lib/photo';

/** A short, readable hint from a product name ("Bajaj Pulsar 150 Disc Brake …" → "Bajaj Pulsar 150"). */
const shortName = (name: string) => {
  const words = name.trim().split(/\s+/).slice(0, 3).join(' ');
  return words.length > 26 ? `${words.slice(0, 25)}…` : words;
};

/**
 * Placeholder hints come from what is really on the site: popular in-stock
 * products and the top-level categories, interleaved. Loaded once and shared
 * by every search box on the page.
 */
let hintsPromise: Promise<string[]> | null = null;
function loadHints(): Promise<string[]> {
  hintsPromise ??= Promise.all([
    listProducts({ sort: 'popular', inStock: true, limit: 12 }).then((r) => r.items.map((p) => shortName(p.name))).catch(() => [] as string[]),
    fetchCategoryTree().then((cats) => cats.map((c) => c.name)).catch(() => [] as string[]),
  ]).then(([products, categories]) => {
    const mixed: string[] = [];
    for (let i = 0; i < Math.max(products.length, categories.length); i++) {
      if (products[i]) mixed.push(products[i]);
      if (categories[i]) mixed.push(categories[i]);
    }
    const seen = new Set<string>();
    const out = mixed.filter((h) => h && !seen.has(h.toLowerCase()) && seen.add(h.toLowerCase()));
    if (!out.length) hintsPromise = null; // try again next time rather than keeping an empty list
    return out;
  });
  return hintsPromise;
}

export function SearchBar({
  autoFocus,
  onNavigate,
  variant = 'light',
}: {
  autoFocus?: boolean;
  onNavigate?: () => void;
  /** 'light' sits on the yellow header bar, 'plain' on a page background. */
  variant?: 'light' | 'plain';
}) {
  const [q, setQ] = useState('');
  const [items, setItems] = useState<Product[]>([]);
  const [open, setOpen] = useState(false);
  const [loading, setLoading] = useState(false);
  const [hint, setHint] = useState(0);
  const [hints, setHints] = useState<string[]>([]);
  const router = useRouter();
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const box = useRef<HTMLDivElement>(null);

  // Rotating placeholder with real product and category names from the site.
  useEffect(() => {
    let alive = true;
    loadHints().then((h) => { if (alive) setHints(h); });
    return () => { alive = false; };
  }, []);
  useEffect(() => {
    if (hints.length < 2) return;
    const t = setInterval(() => setHint((h) => (h + 1) % hints.length), 2800);
    return () => clearInterval(t);
  }, [hints.length]);

  useEffect(() => {
    if (timer.current) clearTimeout(timer.current);
    const term = q.trim();
    if (!term) {
      setItems([]);
      setOpen(false);
      return;
    }
    setLoading(true);
    timer.current = setTimeout(async () => {
      try {
        setItems(await suggestProducts(term));
        setOpen(true);
      } catch {
        /* a dropped suggestion shouldn't interrupt typing */
      } finally {
        setLoading(false);
      }
    }, 220);
    return () => {
      if (timer.current) clearTimeout(timer.current);
    };
  }, [q]);

  useEffect(() => {
    const away = (e: MouseEvent) => {
      if (box.current && !box.current.contains(e.target as Node)) setOpen(false);
    };
    document.addEventListener('mousedown', away);
    return () => document.removeEventListener('mousedown', away);
  }, []);

  const go = () => {
    const term = q.trim();
    if (!term) return;
    setOpen(false);
    router.push(`/search?q=${encodeURIComponent(term)}`);
    onNavigate?.();
  };

  return (
    <div className={s.wrap} ref={box}>
      <form
        role="search"
        className={s.bar}
        data-variant={variant}
        onSubmit={(e) => {
          e.preventDefault();
          go();
        }}
      >
        <span className={s.lead}>
          <Icon name="search" size={17} />
        </span>
        <input
          autoFocus={autoFocus}
          value={q}
          onChange={(e) => setQ(e.target.value)}
          onFocus={() => items.length > 0 && setOpen(true)}
          onKeyDown={(e) => e.key === 'Escape' && setOpen(false)}
          placeholder={hints.length ? `Search "${hints[hint % hints.length]}"` : 'Search products'}
          aria-label="Search products"
          enterKeyHint="search"
        />
        {loading ? (
          <span className={s.trail}>
            <Spinner size={15} />
          </span>
        ) : q ? (
          <button type="button" className={s.trail} onClick={() => setQ('')} aria-label="Clear search">
            <Icon name="x" size={16} />
          </button>
        ) : null}
      </form>

      {open && items.length > 0 ? (
        <div className={`${s.drop} rise`} role="listbox">
          {items.map((p) => (
            <Link
              key={p.id}
              href={`/products/${p.slug}`}
              className={s.row}
              onClick={() => {
                setOpen(false);
                onNavigate?.();
              }}
            >
              <span className={s.thumb}>
                <Image src={smallPhoto(p.photo)} alt="" width={68} height={68} className={fitClass(p.photo, s.thumbArt)} unoptimized />
              </span>
              <span className={s.text}>
                <span className={`${s.rowName} clamp-1`}>{p.name}</span>
                <span className={s.rowSub}>
                  {p.brand ? `${p.brand} · ` : ''}
                  {p.unit}
                </span>
              </span>
              <span className={`num ${s.rowPrice}`}>₹{p.price}</span>
            </Link>
          ))}
          <button type="button" className={s.all} onClick={go}>
            All results for “{q.trim()}”
            <Icon name="arrow-right" size={15} />
          </button>
        </div>
      ) : null}
    </div>
  );
}
