'use client';

import Link from 'next/link';
import React, { useEffect, useRef, useState } from 'react';
import { Icon } from './Icon';
import s from './SellerMenu.module.css';

const OPTIONS = [
  { href: '/warehouse-register', icon: 'store', title: 'Register as Seller', note: 'List your products and sell nearby' },
  { href: '/contact/delivery-partner', icon: 'truck', title: 'Register as Rider', note: 'Deliver orders and earn daily' },
] as const;

/** "Seller / Rider Signup ▾" beside the cart: registration for sellers and for delivery riders. */
export function SellerMenu() {
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) return;
    const close = (e: MouseEvent | KeyboardEvent) => {
      if (e instanceof KeyboardEvent) return e.key === 'Escape' ? setOpen(false) : undefined;
      if (!ref.current?.contains(e.target as Node)) setOpen(false);
    };
    document.addEventListener('mousedown', close);
    document.addEventListener('keydown', close);
    return () => {
      document.removeEventListener('mousedown', close);
      document.removeEventListener('keydown', close);
    };
  }, [open]);

  return (
    <div className={s.wrap} ref={ref}>
      <button type="button" className={s.btn} onClick={() => setOpen((v) => !v)} aria-haspopup="menu" aria-expanded={open}>
        <Icon name="store" size={16} />
        <span className={s.long}>Seller / Rider Signup</span>
        <span className={s.short}>Join Us</span>
        <Icon name="chevron-down" size={14} />
      </button>
      {open ? (
        <div className={s.menu} role="menu">
          {OPTIONS.map((o) => (
            <Link key={o.href} href={o.href} className={s.opt} role="menuitem" onClick={() => setOpen(false)}>
              <span className={s.optIcon}>
                <Icon name={o.icon} size={18} />
              </span>
              <span className={s.optText}>
                <span className={s.optTitle}>{o.title}</span>
                <span className={s.optNote}>{o.note}</span>
              </span>
            </Link>
          ))}
        </div>
      ) : null}
    </div>
  );
}
