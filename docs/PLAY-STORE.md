# Putting the four Autozo apps on Google Play

| App | Folder | Package id | Bundle name |
| --- | --- | --- | --- |
| Customer | `blinkit-app-` | `com.bingoor.app` | `autozo-customer.aab` |
| Warehouse | `autozo-warehouse` | `com.bingoor.warehouse` | `autozo-warehouse.aab` |
| Rider | `autozo-backend/autozo-mobile` | `com.bingoor.rider` | `autozo-rider.aab` |
| Provider | `autozo-provider` | `com.bingoor.provider` | `autozo-provider.aab` |

Package ids cannot change after the first upload. Every app is `versionCode 2` / `1.1`; raise `versionCode` in `android/app/build.gradle` for each new upload.

## 1. Upload key (once)

Same steps as the keystore in the Bingoor project, but with these names. Keep the `.jks` file and both passwords backed up.

```
keytool -genkeypair -v -keystore autozo-upload.jks -alias autozo -keyalg RSA -keysize 2048 -validity 10000
base64 -w0 autozo-upload.jks > autozo-upload.b64
```

GitHub, Settings, Secrets and variables, Actions: `ANDROID_KEYSTORE_BASE64` (the `.b64` text), `ANDROID_KEYSTORE_PASSWORD`, `ANDROID_KEY_ALIAS` (`autozo`), `ANDROID_KEY_PASSWORD`. Use Play App Signing (Play Console default); this is only the upload key. The existing APK workflow is unchanged and still uses the debug key for the website downloads.

## 2. Build the bundles

Actions, **Build Play Store bundles**, Run workflow. It refuses to run without the four secrets. Download the four `.aab` artifacts. For push and phone OTP, add `GOOGLE_SERVICES_<APP>` secrets and, for the rider map, `MAPS_API_KEY`. Note: each Firebase Android app must have the package id above, and add the **Play App Signing** SHA-1/SHA-256 (Play Console, App integrity) to Firebase after the first upload, or Google/OTP sign-in fails for Play-installed builds.

## 3. Policy URLs (live after the website deploy)

- Privacy policy: `https://shop.autozo.org/privacy-policy`
- Account deletion URL (Play Console, App content, Data safety): `https://shop.autozo.org/delete-account`
- In-app deletion: Customer (Profile), Rider (Profile), Warehouse (More, Account), Provider (Account). Backend: `POST /api/v1/auth/delete-account`.

The privacy text is written from what the code collects. Have it read by whoever is legally responsible for Autozo before submitting.

## 4. Store listing

Icon (512) and feature graphic (1024x500) per app are in `docs/play-store/<app>/`. Screenshots: at least 2 phone screenshots per app (16:9 or 9:16, 320 to 3840 px). They must be taken from the real running app; see the notes in the pull request.

### Customer: "Autozo: Groceries & Services"
Short (80): Fast grocery delivery and trusted local services at your door.
Full: Order groceries, daily needs and more from shops near you and get them delivered fast. Track your order live, pay by UPI, card or cash on delivery, and keep your addresses and favourites in one place. You can also book home services such as plumbing, cleaning and car wash from verified local providers. Create an account with your phone number and start shopping.

### Warehouse: "Autozo Warehouse"
Short: Manage your shop's products, stock and orders on Autozo.
Full: For warehouse and shop partners of Autozo. Add products, update stock and prices, receive new orders with an alert, and keep track of your payouts and subscription plan. Registration is approved by the Autozo team.

### Rider: "Autozo Rider"
Short: Accept deliveries, navigate and track your Autozo earnings.
Full: For Autozo delivery partners. Go online, accept nearby delivery orders, follow the route to the customer, collect cash on delivery and see your earnings, wallet and payouts. Location is used only while you are online to assign and track deliveries.

### Provider: "Autozo Provider"
Short: Get service bookings near you and manage your jobs and wallet.
Full: For service professionals on Autozo. List your services, set how far you travel, receive new booking requests with a ring, complete jobs with the customer's OTP, and track your earnings and wallet.

Category: Customer is Shopping; the other three are Business. Contact details, target audience (18+), content rating questionnaire and the "ads: no" answer are filled in the Play Console by the account owner.

## 5. Data safety form (answers drawn from the code)

All four apps: data is encrypted in transit (HTTPS); users can request deletion (URL above).

| Data | Collected | Shared | Purpose |
| --- | --- | --- | --- |
| Name, phone, email | Yes | With the delivering rider/warehouse/provider | Account, orders |
| Address, precise location | Yes (customer saved addresses; rider and provider live location while online) | With the rider/provider for the order | Delivery, assignment, tracking |
| Purchase history | Yes | No | Orders and invoices |
| Payment info | Handled by Razorpay; app stores only payment reference | Razorpay | Payments |
| Photos | Optional uploads | No | Product, shop or service images |
| Device or other ids (push token) | Yes | Google Firebase | Notifications |
| Financial/ID info (warehouse: PAN, Aadhaar, bank; rider/provider: UPI or bank) | Partners only | No | Registration and payouts |

Not collected: contacts, SMS, calls, health, browsing history. No ads, no data sold. Confirm the Warehouse registration fields against the live form before filing.

## 6. Permissions to explain to Play

- `ACCESS_FINE/COARSE_LOCATION`: delivery pin, rider and provider tracking.
- `POST_NOTIFICATIONS`: order and booking alerts.
- Provider app only: `REQUEST_IGNORE_BATTERY_OPTIMIZATIONS` (so the booking ring is not killed in the background). Google restricts this permission and may ask for a justification or reject it. If it is rejected, delete the permission line from `autozo-provider/android/app/src/main/AndroidManifest.xml` and the call in `RingModule.kt`; the app still works, rings may be late on some phones.

## 7. Release steps for the account owner

1. Finish Play Console identity verification and the registration fee.
2. Create each app with the package id above, upload its `.aab` to an internal test track, then fill App content (privacy policy, data safety, deletion URL, target audience, content rating) and the listing.
3. New personal developer accounts must run a closed test with 12 testers for 14 days before production access; organisation accounts skip this.
4. Add the Play App Signing SHA-1 to Firebase, test sign-in from the Play-installed build, then promote to production.

## 8. Reviewer logins (Play Console, App content, "App access")

Google reviewers need a working login for every app. Create or reset four demo accounts on the live server (run in `autozo-backend` where `.env` is):

```
npm run create-review-accounts
```

It makes one demo account per app (customer, warehouse, rider, provider) with phones 9000000001 to 9000000004 and emails `review.<app>@autozo.org`. The password is `REVIEW_PASSWORD` from the environment, or the default written in `src/createReviewAccounts.ts`. Warehouse and provider are pre-approved and every plan runs for a year, so the reviewer lands on the home screen. Paste the phone and password into Play Console under App content, App access (select "All or some functionality is restricted"). Re-running resets the password.
