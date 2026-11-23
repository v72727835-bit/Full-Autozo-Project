import { EnquiryKind } from '../api/support';

/** The six contact forms, in the order the footer lists them. */
export const FORMS: { kind: EnquiryKind; slug: string; title: string; lead: string; reasonLabel: string }[] = [
  { kind: 'city_manager', slug: 'city-manager', title: 'Contact with City manager', lead: 'Write to the manager who looks after your city.', reasonLabel: 'Reason for contacting' },
  { kind: 'invest', slug: 'invest-with-us', title: 'Invest with us', lead: 'Interested in investing in autozo? Tell us a little about yourself.', reasonLabel: 'Reason for contacting' },
  { kind: 'delivery_partner', slug: 'delivery-partner', title: 'Delivery partner contact with us', lead: 'Want to deliver with autozo? Leave your details and we will call you.', reasonLabel: 'Reason for contacting' },
  { kind: 'seller', slug: 'sell-with-us', title: 'Sell your product with us', lead: 'Sellers: share your details and we will create your seller login.', reasonLabel: 'What do you sell?' },
  { kind: 'advertise', slug: 'advertise-with-us', title: 'Advertise your brand with us', lead: 'Put your brand in front of autozo customers.', reasonLabel: 'Reason for contacting' },
  { kind: 'complaint', slug: 'complaint', title: 'Complain to direct City manager', lead: 'Something went wrong? Tell the City manager directly.', reasonLabel: 'Your complaint' },
];

/** Pages shown only on desktop (a phone or the app does not list them, like Blinkit). */
export const DESKTOP_PAGES: { href: string; label: string }[] = [
  { href: '/blog', label: 'Blog' },
  { href: '/delivery-partner', label: 'autozo Delivery Partner' },
  { href: '/seller-partner', label: 'autozo Seller Partner' },
  { href: '/help', label: 'Help & Support' },
  { href: '/p/terms', label: 'Terms & Conditions' },
  { href: '/p/privacy', label: 'Privacy Policy' },
  { href: '/sitemap', label: 'Sitemap' },
];
