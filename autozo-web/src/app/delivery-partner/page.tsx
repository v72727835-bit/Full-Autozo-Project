'use client';

import Link from 'next/link';
import React from 'react';
import { useSettings } from '../../context/SettingsContext';
import { appDownloads } from '../../lib/apps';
import { FORMS } from '../../lib/pages';

import s from '../static.module.css';

export default function Page() {
  const apps = appDownloads(useSettings());
  return (
    <div className={`page rise ${s.wrap}`}>
      <h1 className="h1">Autozo Delivery Partner</h1>
      <p className="body-sm" style={{ margin: '4px 0 22px' }}>Earn by delivering groceries in your own neighbourhood.</p>
      <section className="card card-pad">
        <h2 className="h3">Why deliver with Autozo</h2>
        <ul className={s.list}>
          <li>Short routes from a local warehouse</li>
          <li>Clear earnings and a cash-handling process you can trust</li>
          <li>A simple app: accept, navigate, deliver with an OTP</li>
        </ul>
        <div style={{ display: 'flex', flexWrap: 'wrap', gap: 10 }}>
          <Link href="/contact/delivery-partner" className="btn btn-md btn-primary">Apply to deliver</Link>
          <a href={apps.rider} className="btn btn-md btn-outline">Download rider app</a>
        </div>
      </section>
    </div>
  );
}
