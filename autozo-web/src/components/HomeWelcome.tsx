'use client';

import Link from 'next/link';
import React, { useEffect, useState } from 'react';
import { useAuth } from '../context/AuthContext';
import { Home } from '../lib/types';
import { shortDelivery } from '../lib/deliveryText';
import { Icon } from './Icon';
import s from './HomeWelcome.module.css';

/** Worked out after mount, so the server and the browser never disagree about the hour. */
function greetingFor(hour: number): string {
  if (hour < 5) return 'Up late';
  if (hour < 12) return 'Good morning';
  if (hour < 17) return 'Good afternoon';
  return 'Good evening';
}

const PROMISES = [
  { icon: 'leaf', title: 'Fresh, every day', body: 'Picked from shops near you' },
  { icon: 'tag', title: 'Honest prices', body: 'No hidden charges, ever' },
  { icon: 'shield', title: 'Easy returns', body: 'Not happy? We make it right' },
] as const;

/**
 * The first thing a customer sees: a warm hello, how fast we can be at their
 * door, and the three promises we keep. Sits above the storefront rows.
 */
export function HomeWelcome({ home }: { home: Home }) {
  const { user } = useAuth();
  const [greeting, setGreeting] = useState('Hello');
  useEffect(() => setGreeting(greetingFor(new Date().getHours())), []);

  const first = user?.name?.split(' ')[0];
  const eta = shortDelivery(home);

  return (
    <section className={s.wrap} aria-label="Welcome">
      <div className={s.hello}>
        <p className={s.greet}>
          {greeting}
          {first ? `, ${first}` : ''} <span aria-hidden>👋</span>
        </p>
        <h1 className={s.title}>What can we bring you today?</h1>
        <div className={s.chips}>
          {eta ? (
            <span className={s.eta}>
              <Icon name="bolt" size={14} strokeWidth={2.4} />
              Delivery in {eta.replace(/\s*delivery$/i, '')}
            </span>
          ) : null}
          <Link href="/categories" className={s.browse}>
            Browse all aisles
            <Icon name="arrow-right" size={14} />
          </Link>
        </div>
      </div>

      <ul className={s.promises}>
        {PROMISES.map((p) => (
          <li key={p.title} className={s.promise}>
            <span className={s.pIcon}>
              <Icon name={p.icon} size={18} />
            </span>
            <span>
              <span className={s.pTitle}>{p.title}</span>
              <span className={s.pBody}>{p.body}</span>
            </span>
          </li>
        ))}
      </ul>
    </section>
  );
}
