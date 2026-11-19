'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';
import React from 'react';
import { useCart } from '../context/CartContext';
import { useLanguage } from '../context/LanguageContext';
import { useSettings } from '../context/SettingsContext';
import { Icon, IconName } from './Icon';
import s from './BottomNav.module.css';

interface Tab {
  href: string;
  label: string;
  icon: IconName;
  /** True when the label is already the text to show (the festival's own name). */
  raw?: boolean;
}

const TABS: Tab[] = [
  { href: '/', label: 'home', icon: 'home' },
  { href: '/categories', label: 'categories', icon: 'grid' },
  { href: '/services', label: 'services', icon: 'sliders' },
  { href: '/cart', label: 'cart', icon: 'cart' },
  { href: '/profile', label: 'account', icon: 'user' },
];

export function BottomNav() {
  const pathname = usePathname() || '/';
  const { cart } = useCart();
  const settings = useSettings();
  const { t } = useLanguage();
  const count = cart?.itemCount ?? 0;

  // Search remains available in the mobile header. When the festival is on,
  // it takes the categories slot so the bottom bar stays at five tabs.
  const tabs: Tab[] = settings?.festival?.enabled
    ? [
        TABS[0],
        { href: '/festival', label: settings.festival?.name || 'Festival', icon: 'gift', raw: true },
        TABS[2],
        TABS[3],
        TABS[4],
      ]
    : TABS;

  return (
    <nav className={s.nav} aria-label="Primary">
      {tabs.map((tab) => {
        const on = tab.href === '/' ? pathname === '/' : pathname.startsWith(tab.href);
        return (
          <Link
            key={tab.href}
            href={tab.href}
            className={s.tab}
            data-on={on}
            aria-current={on ? 'page' : undefined}
            onClick={() => {
              // A short tick, like the menu buttons in the app.
              if ('vibrate' in navigator) navigator.vibrate?.(10);
            }}
          >
            <span className={s.ico}>
              <Icon name={tab.icon} size={21} strokeWidth={on ? 2.1 : 1.75} />
              {tab.href === '/cart' && count > 0 ? (
                <span className={`num ${s.dot}`}>{count > 9 ? '9+' : count}</span>
              ) : null}
            </span>
            <span className={s.label}>{tab.raw ? tab.label : t(tab.label)}</span>
          </Link>
        );
      })}
    </nav>
  );
}
