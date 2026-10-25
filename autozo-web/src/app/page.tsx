'use client';

import Link from 'next/link';
import React from 'react';
import { useCatalog } from '../context/CatalogContext';
import { HomeSection } from '../lib/types';
import { DeliverySlots } from '../components/DeliverySlots';
import { BannerCarousel } from '../components/BannerCarousel';
import { CategoryCircle, CategoryTile } from '../components/CategoryTile';
import { ErrorBoundary } from '../components/ErrorBoundary';
import { Icon } from '../components/Icon';
import { ProductCard, ProductCardSkeleton } from '../components/ProductCard';
import { Alert, Button, SectionHead } from '../components/ui';
import s from './home.module.css';

export default function HomePage() {
  const { home, loading, error, reload } = useCatalog();

  if (error && !home) {
    return (
      <div className="page" style={{ paddingTop: 28, maxWidth: 560 }}>
        <Alert tone="bad">{error}</Alert>
        <p className="body-sm" style={{ marginBottom: 16 }}>
          The shop is temporarily unavailable. Please try again shortly.
        </p>
        <Button onClick={reload} icon="repeat">
          Try again
        </Button>
      </div>
    );
  }

  if (loading && !home) return <HomeSkeleton />;
  if (!home) return null;

  // The hero slider sits at the top of the page column, above everything
  // else; promo banners stay where the API put them, between sections.
  type Carousel = Extract<HomeSection, { kind: 'bannerCarousel' }>;
  const isHero = (x: HomeSection): x is Carousel => x.kind === 'bannerCarousel' && x.style !== 'promo';
  const banners = home.sections.filter(isHero);
  const rest = home.sections.filter((x) => !isHero(x));

  return (
    <>
      <div className="page rise" style={{ paddingTop: 16 }}>
        {banners.map((section) => (
          <ErrorBoundary key={section.id} label={section.kind}>
            <BannerCarousel items={section.items} hero />
          </ErrorBoundary>
        ))}
        {home.serviceable ? null : (
          <div style={{ marginBottom: 20 }}>
            <Alert tone="bad">
              We don&apos;t deliver to your pinned address yet. Pick another address on the Addresses page to see
              what&apos;s available there.
            </Alert>
          </div>
        )}
        <DeliverySlots />
        {rest.map((section) => (
          // Per-section, so one malformed block can't blank the storefront.
          <ErrorBoundary key={section.id} label={section.kind}>
            <Section section={section} />
          </ErrorBoundary>
        ))}
      </div>
    </>
  );
}

function Section({ section }: { section: HomeSection }) {
  switch (section.kind) {
    // The hero is drawn above the sections by HomePage; a promo banner sits in line.
    case 'bannerCarousel':
      return section.style === 'promo' ? <BannerCarousel items={section.items} promo /> : null;

    case 'circleRail':
      return (
        <section className={s.circleSection}>
          <div className={`rail ${s.circleRail}`}>
            {section.items.map((c) => (
              <CategoryCircle key={c.id} category={c} />
            ))}
          </div>
        </section>
      );

    case 'categoryGrid':
      return (
        <section className={s.section}>
          <SectionHead title={titleCase(section.title)} />
          <div className="grid-cats">
            {section.items.map((c) => (
              <CategoryTile key={c.id} category={c} />
            ))}
          </div>
        </section>
      );

    case 'productRail': {
      const deals = section.style === 'deals';
      return (
        <section className={s.section}>
          <div className={deals ? s.deals : undefined}>
            <SectionHead
              title={section.title}
              subtitle={section.subtitle}
              eyebrow={deals ? 'Limited time' : undefined}
              href={section.seeAllSlug ? `/categories/${section.seeAllSlug}` : undefined}
            />
            <div className="rail">
              {section.items.map((p) => (
                <ProductCard key={p.id} product={p} width={168} tint={section.tint} />
              ))}
            </div>
          </div>
        </section>
      );
    }

    // Product groups are one swipeable row, like Blinkit and Zepto, not a wall of cards.
    case 'productGrid':
      return (
        <section className={s.section}>
          <SectionHead title={section.title} subtitle={section.subtitle} />
          <div className="rail">
            {section.items.map((p) => (
              <ProductCard key={p.id} product={p} width={168} />
            ))}
          </div>
        </section>
      );

    // Customers never see the warehouses behind their orders.
    case 'storeTiles':
      return null;

    default:
      return null;
  }
}

/** The API shouts some group names ("ALL Sweets"); soften them for display. */
function titleCase(value: string): string {
  if (value !== value.toUpperCase()) return value;
  return value.toLowerCase().replace(/(^|\s|&\s)([a-z])/g, (_, p, c) => p + c.toUpperCase());
}

function HomeSkeleton() {
  return (
    <div className="page" style={{ paddingTop: 20 }}>
      <div className={`sk ${s.skHero}`} />
      <div className={`rail ${s.skCircles}`}>
        {Array.from({ length: 10 }).map((_, i) => (
          <div key={i} className={s.skCircle}>
            <div className="sk" style={{ width: 70, height: 70, borderRadius: '50%' }} />
            <div className="sk" style={{ width: 54, height: 10 }} />
          </div>
        ))}
      </div>
      <div className="sk" style={{ height: 22, width: 220, marginBottom: 16 }} />
      <div className="rail">
        {Array.from({ length: 7 }).map((_, i) => (
          <ProductCardSkeleton key={i} width={168} />
        ))}
      </div>
    </div>
  );
}
