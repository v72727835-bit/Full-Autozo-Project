'use client';

import Image from 'next/image';
import Link from 'next/link';
import React from 'react';
import { useLanguage } from '../context/LanguageContext';
import { fitClass } from '../lib/art';
import { Category } from '../lib/types';
import { Icon } from './Icon';
import s from './CategoryTile.module.css';
import { smallPhoto } from '../lib/photo';

const tile = (tint?: string) =>
  tint ? `color-mix(in srgb, ${tint} var(--tint-mix), var(--surface))` : 'var(--brand-tint)';

/** Square tile used in the category grids — art on a pastel panel. */
export function CategoryTile({ category }: { category: Category }) {
  const { name } = useLanguage();
  return (
    <Link
      href={`/categories/${category.slug}`}
      className={s.tile}
      style={{ ['--tile' as string]: tile(category.tint) }}
    >
      <span className={s.panel}>
        <Image src={smallPhoto(category.image || category.art)} alt="" width={200} height={200} className={fitClass(category.image, s.panelArt)} unoptimized />
      </span>
      <span className={`${s.label} clamp-2`}>{name(category)}</span>
    </Link>
  );
}

/** Round tile used in the quick-pick rail at the top of the home page. */
export function CategoryCircle({ category }: { category: Category }) {
  const { name } = useLanguage();
  return (
    <Link
      href={`/categories/${category.slug}`}
      className={s.circle}
      style={{ ['--tile' as string]: tile(category.tint) }}
    >
      <span className={s.ring}>
        <Image src={smallPhoto(category.image || category.art)} alt="" width={140} height={140} className={fitClass(category.image, s.ringArt)} unoptimized />
      </span>
      <span className={`${s.label} ${s.circleLabel} clamp-2`}>{category.nameHi && name(category) !== category.name ? name(category) : category.short || category.name}</span>
    </Link>
  );
}

/**
 * "Services" next to the categories on phones, where the header's category strip is hidden
 * and the bottom bar has no room for it. From 700 px up the strip carries it, so this hides.
 */
export function ServicesCircle() {
  return (
    <Link href="/services" className={`${s.circle} ${s.servicesOnPhone}`} style={{ ['--tile' as string]: 'var(--brand-tint)' }}>
      <span className={`${s.ring} ${s.servicesRing}`}>
        <Icon name="sliders" size={26} />
      </span>
      <span className={`${s.label} ${s.circleLabel} clamp-2`}>Services</span>
    </Link>
  );
}

/** A full-width "Services" entry at the top of the categories page on phones. */
export function ServicesBar() {
  return (
    <Link href="/services" className={s.servicesBar}>
      <span className={s.servicesBarIcon}>
        <Icon name="sliders" size={22} />
      </span>
      <span className={s.servicesBarText}>
        <b>Services</b>
        <span>Book plumbers, electricians and more at your door</span>
      </span>
      <Icon name="chevron-right" size={18} />
    </Link>
  );
}
