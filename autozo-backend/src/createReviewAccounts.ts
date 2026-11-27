/**
 * Creates (or resets) the four demo logins that Google Play reviewers use to open the Autozo apps.
 * Safe to run again: it updates the same accounts and never touches real users.
 *
 *   npm run create-review-accounts
 *
 * Password: env REVIEW_PASSWORD, or the default below. Phones are in the 9000000xxx test range.
 * The accounts are listed in docs/PLAY-STORE.md (section 8) so they can be pasted into Play Console.
 */
import { connectDB, disconnectDB } from './config/db';
import { Shop } from './models/Shop';
import { User } from './models/User';

const PASSWORD = process.env.REVIEW_PASSWORD || 'AutozoReview@2026';
const YEAR = 365 * 24 * 60 * 60 * 1000;

type Demo = {
  role: 'customer' | 'seller' | 'rider' | 'provider';
  name: string;
  phone: string;
  email: string;
};

export const DEMOS: Demo[] = [
  { role: 'customer', name: 'Play Review Customer', phone: '9000000001', email: 'review.customer@autozo.org' },
  { role: 'seller', name: 'Play Review Warehouse', phone: '9000000002', email: 'review.warehouse@autozo.org' },
  { role: 'rider', name: 'Play Review Rider', phone: '9000000003', email: 'review.rider@autozo.org' },
  { role: 'provider', name: 'Play Review Provider', phone: '9000000004', email: 'review.provider@autozo.org' },
];

async function main() {
  await connectDB();
  const shop = await Shop.findOne({ isActive: true }).sort({ createdAt: 1 }).select('_id name location').lean();
  if (!shop) throw new Error('No active warehouse/shop found. Create one first (npm run seed).');
  const until = new Date(Date.now() + YEAR);

  for (const d of DEMOS) {
    const fields: Record<string, unknown> = { name: d.name, phone: d.phone, email: d.email, role: d.role, isActive: true, phoneVerified: true };
    if (d.role === 'seller') {
      Object.assign(fields, { sellerStatus: 'approved', sellerWarehouses: [shop._id], subscriptionUntil: until });
    }
    if (d.role === 'rider') {
      Object.assign(fields, { warehouse: shop._id, subscriptionUntil: until });
    }
    if (d.role === 'provider') {
      const [lng, lat] = shop.location.coordinates;
      Object.assign(fields, {
        providerStatus: 'approved',
        subscriptionUntil: until,
        providerLocation: { type: 'Point', coordinates: [lng, lat] },
        providerRadiusKm: 10,
        providerApplication: {
          firm: 'Play Review Services', category: 'Home services', line1: 'Review address', city: 'Varanasi', state: 'Uttar Pradesh',
          pincode: '221001', lat, lng, about: 'Demo provider for Google Play review.', submittedAt: new Date(),
        },
      });
    }
    // find by phone+role (unique index), set password last so the pre-save hook hashes it
    const user = (await User.findOne({ phone: d.phone, role: d.role })) ?? new User({ phone: d.phone, role: d.role });
    user.set(fields);
    user.password = PASSWORD;
    await user.save();
    console.log(`${d.role.padEnd(9)} ${d.phone}  ${d.email}`);
  }
  console.log('Done. Password is REVIEW_PASSWORD or the default in createReviewAccounts.ts');
  await disconnectDB();
}

main().catch(async (err) => {
  console.error('Failed to create review accounts:', err);
  await disconnectDB();
  process.exit(1);
});
