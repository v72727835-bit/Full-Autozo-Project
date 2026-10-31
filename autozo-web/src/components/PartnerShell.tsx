'use client';

import Link from 'next/link';
import React from 'react';
import { BackButton } from './BackButton';
import { Icon, IconName } from './Icon';
import s from './PartnerShell.module.css';

export type PartnerKind = 'rider' | 'warehouse' | 'provider';

const TABS: { kind: PartnerKind; href: string; label: string; icon: IconName }[] = [
  { kind: 'rider', href: '/contact/delivery-partner', label: 'Rider', icon: 'truck' },
  { kind: 'warehouse', href: '/warehouse-register', label: 'Warehouse', icon: 'store' },
  { kind: 'provider', href: '/provider-register', label: 'Service provider', icon: 'bolt' },
];

/**
 * The shared frame of the three partner sign-ups (rider, warehouse, service
 * provider): tabs to switch between them, a brand panel with the perks and
 * the three steps, and the form card. Side by side on a desktop; on a phone
 * the panel shrinks to a short header so the form starts high on the screen.
 */
export function PartnerShell({
  active, kicker, title, lead, perks, steps, extra, children,
}: {
  active: PartnerKind;
  kicker: string;
  title: string;
  lead: string;
  perks: { icon: IconName; text: string }[];
  steps: string[];
  /** e.g. "Already approved? Download the app". */
  extra?: React.ReactNode;
  children: React.ReactNode;
}) {
  return (
    <div className={`page rise ${s.wrap}`}>
      <div className={s.topRow}>
        <BackButton />
        <nav className={s.tabs} aria-label="Join Autozo as">
          {TABS.map((t) => (
            <Link key={t.kind} href={t.href} className={`${s.tab} ${t.kind === active ? s.tabOn : ''}`} aria-current={t.kind === active ? 'page' : undefined}>
              <Icon name={t.icon} size={15} />
              {t.label}
            </Link>
          ))}
        </nav>
      </div>

      <div className={s.grid}>
        <aside className={s.aside}>
          <span className={s.kicker}><Icon name="bolt" size={12} /> {kicker}</span>
          <h1 className={s.title}>{title}</h1>
          <p className={s.lead}>{lead}</p>
          <ul className={s.perks}>
            {perks.map((p) => (
              <li key={p.text} className={s.perk}>
                <span className={s.perkIcon}><Icon name={p.icon} size={15} /></span>
                {p.text}
              </li>
            ))}
          </ul>
          <ol className={s.steps}>
            {steps.map((t, i) => (
              <li key={t} className={s.step}>
                <span className={s.stepNum}>{i + 1}</span>
                <span>{t}</span>
              </li>
            ))}
          </ol>
          {extra ? <div className={s.extra}>{extra}</div> : null}
        </aside>

        <div className={s.main}>{children}</div>
      </div>
    </div>
  );
}

/** A titled block inside the form card ("1 · Your details"). */
export function FormGroup({ n, title, children }: { n: number; title: string; children: React.ReactNode }) {
  return (
    <fieldset className={s.group}>
      <legend className={s.groupTitle}><span className={s.groupNum}>{n}</span>{title}</legend>
      {children}
    </fieldset>
  );
}

/** The "we got it" screen after a partner sign-up. */
export function PartnerDone({ title, children, actions }: { title: string; children: React.ReactNode; actions: React.ReactNode }) {
  return (
    <div className={s.done}>
      <span className={s.doneIcon}><Icon name="check" size={30} /></span>
      <h2 className={s.doneTitle}>{title}</h2>
      <div className={s.doneText}>{children}</div>
      <div className={s.doneActions}>{actions}</div>
    </div>
  );
}

export { s as partnerStyles };
