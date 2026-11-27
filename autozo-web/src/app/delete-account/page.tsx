import Link from 'next/link';
import React from 'react';
import s from '../static.module.css';

export const metadata = {
  title: 'Delete your account · autozo',
  description: 'How to delete your autozo account and personal data, and what we keep.',
};

/** Public account-deletion page required by Google Play. Works without logging in. */
export default function Page() {
  return (
    <div className={`page rise ${s.wrap}`}>
      <h1 className="h1">Delete your autozo account</h1>
      <p className="body-sm" style={{ margin: '4px 0 22px' }}>For the autozo Customer, Rider, Warehouse and Service Provider apps and the website.</p>

      <section className="card card-pad">
        <h2 className="h3">Delete it yourself in the app</h2>
        <ol className={s.list}>
          <li><b>Customer app:</b> Profile, then <b>Delete account</b>.</li>
          <li><b>Rider app:</b> Profile, scroll down, <b>Delete account</b>.</li>
          <li><b>Warehouse app:</b> More, then Account, scroll down, <b>Delete account</b>.</li>
          <li><b>Service Provider app:</b> Account, scroll down, <b>Delete account</b>.</li>
        </ol>
        <p className="body-sm">Enter your password to confirm. Your account is deleted straight away and you are signed out.</p>
      </section>

      <section className="card card-pad" style={{ marginTop: 16 }}>
        <h2 className="h3">Cannot sign in, or no longer have the app?</h2>
        <p className="body-sm" style={{ margin: '6px 0 14px' }}>
          Send us a deletion request from the phone number on your account and we will delete it for you within 7 days.
        </p>
        <div className={s.row}>
          <Link href="/contact/complaint" className="btn btn-md btn-primary">Request account deletion</Link>
          <Link href="/support" className="btn btn-md btn-outline">Chat with customer care</Link>
        </div>
      </section>

      <section className="card card-pad" style={{ marginTop: 16 }}>
        <h2 className="h3">What is deleted and what is kept</h2>
        <ul className={s.list}>
          <li><b>Deleted:</b> name, phone number, email, profile photo, saved addresses, saved items, cart, notification tokens, partner business, payout and registration details, and your sign-in.</li>
          <li><b>Kept without your personal details:</b> orders, bookings, invoices and payment records, because tax and accounting law (for example GST) requires us to keep them. They no longer identify you.</li>
          <li>An order or booking that is still in progress must finish or be cancelled before the account can be deleted.</li>
        </ul>
        <p className="body-sm">See also our <Link href="/privacy-policy">Privacy Policy</Link>.</p>
      </section>
    </div>
  );
}
