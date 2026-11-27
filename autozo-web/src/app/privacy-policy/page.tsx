import Link from 'next/link';
import React from 'react';
import s from '../static.module.css';

export const metadata = {
  title: 'Privacy Policy · autozo',
  description: 'What autozo collects, why, who sees it, how long we keep it, and how to delete your account.',
};

/** Static (not CMS) so the link given to Google Play always works. */
export default function Page() {
  return (
    <div className={`page rise ${s.wrap}`}>
      <h1 className="h1">Privacy Policy</h1>
      <p className="body-sm" style={{ margin: '4px 0 22px' }}>
        Applies to the autozo website and the autozo Customer, Rider, Warehouse and Service Provider apps. Last updated 27 November 2026.
      </p>

      <section className="card card-pad">
        <h2 className="h3">What we collect</h2>
        <ul className={s.list}>
          <li><b>Account details:</b> name, phone number, email (optional) and a password stored only as a one-way hash. If you sign in with Google or Facebook we receive your name, email and account id from them.</li>
          <li><b>Addresses and location:</b> delivery addresses you save and, when you allow it, your phone&apos;s location to find your area and pin the delivery spot. Riders and service providers share their live location while they are online so orders and bookings can be assigned and tracked.</li>
          <li><b>Orders and bookings:</b> what you bought or booked, amounts, status, delivery and payment records, and chat messages with customer care.</li>
          <li><b>Payments:</b> online payments are handled by our payment partner (Razorpay). We do not see or store your card or UPI PIN details; we keep the payment reference and status.</li>
          <li><b>Partners only (riders, warehouses, service providers):</b> business and address details, and for payouts a UPI id or bank account. Warehouse sellers may also give PAN or Aadhaar for registration.</li>
          <li><b>Device information:</b> a notification token (Firebase Cloud Messaging) so we can send order updates, and basic technical logs to keep the service running.</li>
          <li><b>Photos:</b> product, shop or service images you choose to upload.</li>
        </ul>
      </section>

      <section className="card card-pad" style={{ marginTop: 16 }}>
        <h2 className="h3">Why we use it</h2>
        <ul className={s.list}>
          <li>To create your account, take and deliver orders, run bookings and pay partners.</li>
          <li>To send order, delivery and account notifications and to give customer care support.</li>
          <li>To prevent fraud, enforce our terms and meet tax and accounting law (for example GST invoices).</li>
        </ul>
        <p className="body-sm">We do not sell your personal data and we do not show third-party ads based on it.</p>
      </section>

      <section className="card card-pad" style={{ marginTop: 16 }}>
        <h2 className="h3">Who it is shared with</h2>
        <ul className={s.list}>
          <li>The warehouse and delivery rider fulfilling your order see your name, phone, address and delivery pin. A service provider sees the same for your booking.</li>
          <li>Service providers we use: Google (Maps, Firebase sign-in and notifications), Razorpay (payments) and our hosting provider. They process data only to provide their service to us.</li>
          <li>Authorities, when the law requires it.</li>
        </ul>
        <p className="body-sm">Data travels over HTTPS. Passwords are hashed and sensitive payment keys are encrypted on our servers.</p>
      </section>

      <section className="card card-pad" style={{ marginTop: 16 }}>
        <h2 className="h3">How long we keep it, and your choices</h2>
        <ul className={s.list}>
          <li>You can see and edit your details in the app under Profile / Account.</li>
          <li>You can delete your account at any time: see <Link href="/delete-account">how to delete your account</Link>. We then erase your name, phone, email, addresses, saved items and notification tokens. Order, invoice and payment records are kept without your personal details for as long as tax and accounting law requires.</li>
          <li>You can turn off location or notifications in your phone settings; some features (delivery to your pin, order alerts) will then not work.</li>
        </ul>
      </section>

      <section className="card card-pad" style={{ marginTop: 16 }}>
        <h2 className="h3">Children</h2>
        <p className="body-sm">autozo is not meant for children under 18 and we do not knowingly collect their data.</p>
      </section>

      <section className="card card-pad" style={{ marginTop: 16 }}>
        <h2 className="h3">Contact us</h2>
        <p className="body-sm">Questions, access or correction requests: <Link href="/support">chat with customer care</Link> or use <Link href="/contact">the contact form</Link>. We reply within a few working days. We may update this policy; the date above shows the latest version.</p>
      </section>
    </div>
  );
}
