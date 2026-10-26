# Autozo / Bingoor — Full Project Analysis

> Quick-commerce (Blinkit/Zepto-style) platform. One monorepo, 5 apps + shared infra.
> Analysis date: 2026-10-26. No files were modified during this review.

---

## 1. System overview

| Part | What it is | Stack | ~LOC |
| --- | --- | --- | --- |
| `autozo-backend` | One API for customers, riders, sellers/warehouses, admin | Express 4 + Mongoose 8 + TypeScript | 12k |
| `autozo-web` | Customer website (`shop.autozo.org`) | Next.js 16 + React 19 | 11k |
| `autozo-admin` | Super-admin + seller/warehouse panel (`panel.autozo.org`) | Next.js 16 (wraps old Vite SPA) + React 18 | 14k |
| `blinkit-app-` | Customer mobile app (`com.bingoor.app`) | React Native 0.87 + Redux Toolkit | 14k |
| `autozo-backend/autozo-mobile` | Rider app (`com.bingoor.rider`) | React Native 0.87 + Context | 3k |
| `autozo-warehouse` | Warehouse app (`com.bingoor.warehouse`) | React Native 0.87 + Context | 2k |

**Live domains (actual code):** API `app-api.autozo.org/api/v1`, web `shop.autozo.org`, admin `panel.autozo.org`, downloads `autozo.org/downloads` + `app-api.autozo.org/downloads`.

**Roles:** `customer | rider | seller | admin` (one `User` account can be multiple roles — role-scoped unique indexes).

**Deployment:** Single cPanel/CloudLinux host runs backend + web + admin + MongoDB. `deploy.sh` pulls `main`, rebuilds all three, restarts via Passenger. Android APKs built in GitHub Actions, served from the backend/website. `render.yaml` exists but is vestigial.

---

## 2. Architecture highlights (what's done well)

- **Backend security fundamentals are solid:** bcrypt(10), refresh-token rotation + sha256 hashing + per-device cap (5), role re-checked from DB on every request, Razorpay/invoice HMAC with `timingSafeEqual`, integration secrets AES-256-GCM encrypted at rest, zod validation on nearly every route, atomic payment-intent/plan claims (no double-order/double-credit), atomic stock reservation with compensating rollback.
- **No secrets in git:** `.env` gitignored; keys live in server env + admin panel ("Login & Payments"), stored encrypted.
- **Thoughtful UX engineering:** strong user-facing error copy (server "problem" codes → readable sentences), eager/compressed image uploads, pop-up-safe invoices, single-flight 401 refresh, graceful degradation when Firebase/social SDKs absent, defensive carousels.
- **Catalog caching:** in-memory 30s TTL with request coalescing + backpressure; `invalidateOnWrite` clears on writes.
- **Clean invoice/GST engine:** inter/intra-state CGST/SGST vs IGST, A4 + 80mm POS, barcode/QR, amount-in-words, short-lived HMAC-signed links.

---

## 3. Consolidated findings (ranked, cross-project)

### 🔴 CRITICAL / HIGH

1. **Rider payouts are broken + duplicate-payout risk — `WalletTxn` schema bug.**
   `payoutId`/`payoutStatus` are in the TS interface (`autozo-backend/src/models/WalletTxn.ts:28-29`) but **missing from the schema body** (~`:40-52`), so Mongoose strict mode silently drops them on save. Result: auto-paid rider withdrawals get stuck `pending` (webhook/settlement `findOne({payoutId})` never matches), and the retry idempotency guard `if (txn.payoutId) throw` (`services/razorpayx.service.ts:142`) can never fire → **retries can issue duplicate payouts**. `SellerTxn` has the fields correctly, confirming it's accidental. **Fix: add the two fields to the WalletTxn schema.** (This is the single most important bug — real money.)

2. **No CI quality gates on the deploy path.** The only workflows GitHub actually runs (`.github/workflows/deploy.yml`, `build-apks.yml`, `update-apks.yml`) never run lint/typecheck/tests. The gating `ci.yml` files sit in **subdirectories** (`autozo-web/.github/...`, etc.) which GitHub Actions never executes. A bad commit to `main` goes straight to `deploy.sh`. **Fix: move CI to root `.github/workflows/`, add `tsc --noEmit` + `npm test` + `next build`, make `deploy.yml` depend on them.**

3. **Release APKs signed with a committed debug keystore (all 3 apps).** `*/android/app/build.gradle` → `buildTypes.release { signingConfig signingConfigs.debug }`, `storePassword 'android'`, keystore in git. Blocks Play Store, shared key across apps, anyone can re-sign. **Fix: per-app upload keystores as CI secrets.**

4. **Committed Firebase config + API key.** `google-services.json` committed for all three apps (carries `AIzaSy…`). CI already injects it via `GOOGLE_SERVICES_*` secrets, so the committed copies are redundant. **Fix: rotate/restrict the key, stop committing the files.**

5. **Facebook login links accounts by *unverified* email → account takeover.** `auth.controller.ts:207-210` passes `me.email` unverified; Google path correctly requires `email_verified` (`:192`). Matching/linking by email (`:160`) lets an attacker with a Facebook account bearing a victim's email log into the victim's account. **Fix: only auto-link Facebook when email verified, else link by `facebookId` only.**

6. **SEO effectively absent for a public storefront.** All 27 web pages are `'use client'` (100% CSR); no `generateMetadata` on product/category pages, no `app/sitemap.ts`/`robots.ts`, no `robots.txt`/`sitemap.xml`. Product/category pages are uncrawlable and share one generic title. **Fix: SSR (or a server metadata layer) for product/category + real sitemap/robots + Product JSON-LD.** Most serious growth gap for bingoor.com.

### 🟠 MEDIUM

7. **RazorpayX webhook unauthenticated.** `POST /api/v1/webhooks/razorpayx` (`routes/index.ts:52`) never verifies the signature; `verifyRazorpayxWebhook` exists but is unused. Impact limited (handlers re-fetch real status) but anyone can trigger sync work by replaying a payout id. **Fix: capture raw body, enforce signature.**

8. **CORS reflects any origin with credentials.** `app.ts:21-26` + default `CORS_ORIGINS=*` (`config/env.ts:14`, also `render.yaml`). Mitigated only because auth is Bearer (not cookies). **Fix: explicit allow-list in production.**

9. **Integration-secret encryption key derived from `JWT_REFRESH_SECRET`** (`secretBox.ts:5`). Rotating the JWT secret makes every stored gateway secret undecryptable; also couples session signing with payment-key confidentiality. **Fix: dedicated `SECRET_BOX_KEY`.**

10. **Production builds skip type-checking.** `next.config.ts` sets `typescript.ignoreBuildErrors: true` under `AUTOZO_LOW_RESOURCE=1` on the cPanel host (both web and admin). A type error ships to prod if CI is skipped. Ties back to #2. **Fix: enforce CI typecheck as a hard gate.**

11. **React 18 under Next 16 in admin only.** `autozo-admin` pins `react@^18.3.1`; web + both RN apps are React 19. Next 16's App Router targets React 19 — unsupported/fragile pairing and the odd one out. **Fix: upgrade admin to React 19.**

12. **Auth tokens in localStorage (web + admin)** alongside injected third-party scripts (Razorpay, Google GSI, Facebook, Firebase). Any XSS exfiltrates long-lived refresh tokens. `tokens.user` getter also `JSON.parse`s without try/catch. **Fix: httpOnly refresh cookie or shorter refresh TTL + CSP; guard the parse.**

13. **Single-host, all-services-down deploys.** Every deploy pauses backend + web + admin on one thread-capped account (minutes of downtime), competing with MongoDB for threads. No staging, no redundancy. **Fix: at least split the backend onto its own host; add staging.**

14. **Customer app signs user out on flaky network.** `blinkit-app-/src/api/client.ts` `refreshTokens()` returns `null` on *any* error → logout on a transient blip. The **rider app already fixed this** (`autozo-backend/autozo-mobile/src/api/client.ts:38` re-throws on network/5xx). **Fix: port rider logic to customer + warehouse.**

15. **Production depends on free public OSM/OSRM demo endpoints** called straight from browsers (Nominatim geocoding, `router.project-osrm.org` routing in `autozo-web/src/lib/route.ts:25`; rider app loads Leaflet from `unpkg.com` + OSM tiles with attribution off). These rate-limit/ban under real traffic. **Fix: keyed provider or self-host; add OSM attribution.**

16. **`next/image` is `unoptimized` everywhere (web)** (12 instances) and `images.remotePatterns` allows `**` over http+https. No responsive sizing/format conversion; `/_next/image` open to any host. **Fix: enable optimizer/CDN with `sizes`, tighten remote patterns.**

17. **Weak 6-char password policy, shared with admin login** (`validators/schemas.ts:12`); no complexity, no per-account lockout (only IP-keyed limiter). With `trust proxy:1`, extra proxy hops let `X-Forwarded-For` spoof the limiter key. **Fix: stronger admin policy + verify proxy hop count.**

18. **Signup shows plaintext password and copies it to clipboard** (`autozo-web/src/app/signup/page.tsx:131-159`). Shoulder-surf + clipboard persistence. Password rules also inconsistent across forms (8–15 vs min 6). **Fix: remove, standardize policy.**

19. **Massive mobile infra duplication, already drifting.** `config.ts`, `api/client.ts`, `storage/tokens.ts`, `firebase/push.ts`, `firebase/phoneOtp.ts`, `utils/validation.ts` are copy-pasted across 3 apps with no shared package (and #14 proves drift). **Fix: extract a shared internal workspace package.**

20. **Polling sprawl / no realtime (admin).** 4–5 overlapping intervals per session (orders 15s, tickets/apps/alerts 30s, stats 60s, live board 20s) run regardless of tab visibility. **Fix: consolidate timers, pause on `document.hidden`, consider SSE/WebSocket.**

21. **Duplicated, *inconsistent* order-status helpers.** `autozo-admin/src/screens/OrdersPage.tsx:30-43` vs `src/seller/common.ts:3-9` disagree (`placed` tone differs). **Fix: one shared `lib/orderStatus.ts`.**

22. **Non-atomic admin refund + no automated refund worker.** `refundOrderAdmin` checks-then-refunds without an atomic claim (concurrent clicks → double refund); customer-cancelled paid orders sit `refund_pending` with no worker — refunds are entirely manual. **Fix: atomic `findOneAndUpdate` claim + reconciliation.**

### 🟡 LOW (quick wins / hygiene)

23. **Dead code to delete:** ~1.4 MB orphaned Python `.whl` files in `autozo-backend/` (no Python anywhere); abandoned `autozo-backend/autozo-app/` Expo app; vestigial Vite layer in admin (`vite.config.ts`, `index.html`, empty `src/main.tsx`/`App.tsx` referencing uninstalled deps); vestigial `render.yaml`; dead `react-native-maps` dep + unused `MAPS_API_KEY` plumbing in the rider app.
24. **All 3 RN apps share `namespace "com.bingoor.app"`** while `applicationId` differs — R/BuildConfig package mismatch footgun.
25. **`versionCode` stuck at 2 on all apps** — no way to force-update or stage the OTP rollout `docs/FIREBASE.md` depends on. **Fix: bump from CI run number.**
26. **Unescaped `$regex` in admin seller search** (`seller.controller.ts:298`) — ReDoS/regex-injection, admin-only.
27. **No DB transactions for multi-doc order placement** (`order.controller.ts:59-217`) — crash mid-sequence can decrement stock without an order.
28. **In-process hourly scheduler** (`subscription.service.ts:121`) — fires N× on multi-instance, lost on restart.
29. **Silent failure of money side-effects** — `creditDeliveryEarning`/`creditSellerEarnings` called with `.catch(()=>undefined)`; idempotent so retries are safe, but failures are invisible. **Fix: log to `AdminAlert`.**
30. **No error reporting / observability anywhere** — `ErrorBoundary` only `console.error`s, failures swallowed; no Sentry/analytics. Web also has no error boundary around admin's `ssr:false` screens.
31. **Domain/branding inconsistency:** `README.md` says `bingoor.com`/`admin.bingoor.com`; inert CI says `api.bingoor.com`; production is `*.autozo.org`. Admin `README.md` is mojibake.
32. **Near-zero meaningful test coverage on mobile** (one duplicated `validation.test.ts`; warehouse has a test script but no tests). Backend tests are good but miss payouts, seller commission, GST/invoice, refresh rotation, social login, webhook.
33. **i18n only covers ~45 labels (web)**; most UI is hardcoded English, and some Hinglish leaks into English UI (`orders/[id]/page.tsx:148`).

---

## 4. Suggested priority order

**Fix now (correctness + money + security):**
1. `WalletTxn` schema fields (#1) — broken payouts / duplicate-payout risk
2. Facebook unverified-email linking (#5) — account takeover
3. RazorpayX webhook signature (#7), CORS allow-list (#8), secretBox key (#9)
4. Non-atomic refund + refund worker (#22)

**Fix soon (quality gates + platform):**
5. Root CI with typecheck/test/build gating deploy (#2, #10)
6. Per-app upload keystores + stop committing Firebase config (#3, #4)
7. Split backend host / add staging (#13)
8. Customer-app token-refresh fix (#14)

**Growth / scaling:**
9. Web SEO: SSR + sitemap/robots + JSON-LD (#6)
10. Image optimization (#16), realtime instead of polling (#20), keyed maps provider (#15)
11. React 19 for admin (#11), shared mobile package (#19)

**Hygiene (fast):** delete dead code (#23), bump versionCode (#25), fix namespaces (#24), reconcile domains/README (#31).

---

*Generated from a 5-thread parallel analysis (backend, web, admin, mobile apps, infra/CI-CD).*
