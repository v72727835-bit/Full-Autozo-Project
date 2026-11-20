# Autozo: Six Features Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:executing-plans (native, in this session). The owner asked for one feature at a time, each finished (tests + typecheck + commit + push) before the next. Steps use checkbox (`- [ ]`) syntax.

**Goal:** Ship six owner-requested changes to Full-Autozo-Project, one feature at a time: (1) rider cash shows pending after collection, (2) provider sets a service radius, (3) Services option near categories on phone web, (4) super-admin-controlled dynamic theme/colours on web + all apps, (5) riders/warehouses/providers pay the admin online (cash dues, subscriptions) opening straight on the phone, (6) every app also runs on iOS.

**Architecture:** Backend (Express/Mongoose/TS, `autozo-backend`) stays the single source of truth: theme and payment state live in `Settings`/existing payment models and are exposed through `/settings/public` and existing authenticated routes. Web (`autozo-web`, Next.js) and the four React Native apps read theme from `/settings/public` at runtime and fall back to today's built-in colours. Payments reuse the existing Razorpay service and the `SubscriptionPayment`/`PaymentIntent` models; no new gateway.

**Tech Stack:** TypeScript, Express, Mongoose, zod, Next.js (see `autozo-web/AGENTS.md`: not the Next.js you know), React Native 0.87.1 / React 19.2.3, Razorpay, node:test + tsx, GitHub Actions.

**Spec:** the owner's chat message of 2026-11-20 (Hinglish) plus its follow-up "web and app har ek jagah, aur sare app iOS me bhi chale". Interpretation decisions (owner said "apne se soch ke"):
- "server ka option" = the **Services** option (`/services`), placed high on phone view beside the categories.
- "rider cash collect ke baad bhi pending" = after the office collects the rider's cash, the rider's panel must stop counting it.
- "direct phone pe open ho jaye" = the Razorpay checkout / UPI app opens inline on the phone and the payment is credited to the admin automatically (webhook), no manual confirmation.

## Global Constraints

- Work only in `/home/user/Full-Autozo-Project`, branch `claude/friendly-feynman-kcdzc9`; push only there; draft PR at the end. Never touch `Full-Bingoor-Project` from this plan.
- Never use or log into the owner's VPS; no credentials in code. Razorpay keys come from the admin settings already in the repo, never hardcoded.
- Customer-facing app default colours must stay identical when no theme is saved (theme is an override, not a redesign).
- Each feature ends with: typecheck clean, backend `npm test` + `npm run test:integration` green, one commit, one push.
- No iOS build can run on this Linux box; iOS work is verified by a macOS GitHub Actions job and reported honestly as unverified until that job is green.

## Review Focus

- Theme with an invalid/short hex or a missing setting must fall back to defaults, never blank/white-on-white text.
- Dark mode: a super-admin brand colour must keep readable contrast (`brand-ink` chosen automatically).
- Rider cash: submitting twice, partial amounts, and an admin rejecting a submission must not zero or double-count pending.
- Online payment webhook delivered twice, or arriving before the client confirms, must credit exactly once.
- Provider radius at the limits (1 and 100 km) and a customer exactly on the boundary.
- iOS: any Android-only API (`PermissionsAndroid`, `Linking.sendIntent`, native ring service) must be guarded by `Platform.OS`.

## File Structure (known; discovery steps below find the rest)

- Backend: `src/models/Settings.ts`, `src/controllers/catalog.controller.ts` (`publicSettings`), `src/controllers/riderWallet.controller.ts`, `src/controllers/adminExtra.controller.ts`, `src/services/rider.service.ts`, `src/services/razorpay.service.ts`, `src/services/subscription.service.ts`, `src/services/providerPay.service.ts`, `src/models/{Service,User,SubscriptionPayment,PaymentIntent,WalletTxn,ProviderTxn}.ts`, `src/validators/schemas.ts`, `src/routes/{index,admin}.ts`.
- Web: `autozo-web/src/components/{Header,BottomNav}.tsx` + `Header.module.css`, `src/app/page.tsx`, `src/app/globals.css`, `src/context/ThemeContext.tsx`, `src/app/layout.tsx`.
- Admin: `autozo-admin/src/styles.css` plus one new settings screen.
- Apps: `blinkit-app-` (customer), `autozo-provider`, `autozo-warehouse`, `autozo-backend/autozo-mobile` (rider); each has its own theme file (`src/theme/palette.ts` or `src/theme.ts`).

---

### Task 1: Rider cash no longer shows pending after the office collects it

**Files:**
- Modify: `autozo-backend/src/controllers/adminExtra.controller.ts` (the cash-submit confirm handler, ~L385), `autozo-backend/src/services/rider.service.ts` (`codSummary`)
- Modify (if the rider screen computes its own number): rider app wallet screen under `autozo-backend/autozo-mobile/src/screens/`
- Test: `autozo-backend/tests/rider-cash-settle.integration.ts`

**Interfaces:**
- Produces: confirming a `cash_submit` marks the covered delivered COD orders `codSettled: true`, oldest first, up to the submitted amount, so `codSummary(...).get(riderId).pending` drops by that amount.

- [ ] **Step 1: Read the handler and find why pending stays.** Read `markCashSubmit` in `adminExtra.controller.ts` and `submitCash` in `riderWallet.controller.ts`; write down whether confirming sets `codSettled` on orders or only flips the `WalletTxn` status.
- [ ] **Step 2: Failing test** `confirming a cash submission lowers the rider's pending COD, partial amounts settle oldest orders first, and a rejected submission leaves pending unchanged` — seed 3 delivered COD orders (₹100/200/300), submit ₹300, confirm, assert `codSummary` pending is 300 (not 600), then reject another and assert unchanged.
- [ ] **Step 3: Run it, expect FAIL.** `cd autozo-backend && npx tsx --test tests/rider-cash-settle.integration.ts`
- [ ] **Step 4: Fix** so confirm settles orders atomically (single `updateMany` by ordered ids chosen inside the handler) and is idempotent on a second confirm (409 already handled today).
- [ ] **Step 5: Verify the rider app and admin riders page both read `codPending` from the same source;** adjust only if one computes its own sum.
- [ ] **Step 6: Run full backend suites + typecheck, commit** `fix(rider): cash the office collected no longer counts as pending`, push.

### Task 2: Provider sets how far they will serve

**Files:**
- Modify: `autozo-backend/src/validators/schemas.ts` (provider service/profile body), `autozo-backend/src/controllers/` provider-service controller (find with `grep -rn serviceRadiusKm autozo-backend/src`), customer service search (distance filter)
- Modify: provider app service form + profile screen under `autozo-provider/src/screens/`
- Test: `autozo-backend/tests/provider-radius.integration.ts`

**Interfaces:**
- Consumes: `Service.serviceRadiusKm` (1–100, default 10) and `User.providerLocation`.
- Produces: provider app control "How far will you serve (km)" bound to `serviceRadiusKm`; customer service lists only return services whose provider is within that radius of the customer pin.

- [ ] **Step 1: Test** `a service is listed only for customers inside its radius, 1 km and 100 km limits are accepted, 0 and 101 rejected, a customer exactly on the boundary is included`.
- [ ] **Step 2: Run, expect FAIL** (no UI/validator/filter yet, or filter missing).
- [ ] **Step 3: Backend:** accept `serviceRadiusKm` in create/update validators; ensure the customer service query applies `$geoNear`/haversine against `serviceRadiusKm` per service.
- [ ] **Step 4: Provider app:** add a numeric stepper/slider (1–100 km) to the service form and a default-radius field in the profile; show the radius on the provider dashboard.
- [ ] **Step 5: Typecheck apps + backend tests, commit** `feat(provider): set service radius from own location`, push.

### Task 3: Services option sits beside the categories on phone web

**Files:**
- Modify: `autozo-web/src/components/Header.tsx` (strip with `Services` link at ~L149), `Header.module.css`, `autozo-web/src/app/page.tsx` (category row), possibly `BottomNav.tsx`
- Test: `autozo-web` Playwright/e2e if present under `e2e/`, else a component render check

**Interfaces:**
- Produces: on viewport ≤ 640 px the Services entry appears in the first visible row next to the category circles (not after scrolling past all categories), with the same link and active state.

- [ ] **Step 1: Screenshot the current phone view** (Playwright, 390×844) to record where Services is today.
- [ ] **Step 2: Move/duplicate the entry** into the category strip/home category row for narrow screens only; desktop layout untouched.
- [ ] **Step 3: Screenshot again** (deviceScaleFactor 2) and confirm Services is visible without horizontal scroll hunting.
- [ ] **Step 4: Web typecheck + build, commit** `feat(web): services option beside categories on phones`, push.

### Task 4: Super admin controls the theme/colours everywhere

**Files:**
- Modify: `autozo-backend/src/models/Settings.ts` (new `theme` object), `catalog.controller.ts` (`publicSettings`), validators + admin settings route
- Create: admin screen `autozo-admin/src/screens/ThemePage.tsx` (colour pickers, live preview, reset), nav entry
- Create: `autozo-web/src/lib/theme.ts` (derive tint/hover/ink from one brand hex), apply in `ThemeContext.tsx`/`layout.tsx`
- Create: shared per-app `applyRemoteTheme` in each app's theme file
- Test: `autozo-backend/tests/theme-settings.integration.ts`; unit test for the colour-derivation helper

**Interfaces:**
- Produces: `Settings.theme = { brand, accent?, headerBg?, dark?: { brand } }` (hex strings), validated `^#[0-9a-fA-F]{6}$`; `/settings/public` returns `theme` or `null`; `deriveBrandScale(hex): { brand, hover, press, ink, tint, tint2, line, text }` (ink chosen for WCAG contrast).

- [ ] **Step 1: Failing tests:** invalid hex rejected; saved theme appears in `/settings/public`; no theme returns null; `deriveBrandScale('#0e8a3e')` reproduces today's `--brand-*` values closely and picks readable ink for light and dark brands.
- [ ] **Step 2: Backend** model, validator, admin save endpoint, public exposure (cache-bust the public settings cache on save).
- [ ] **Step 3: Admin screen** with pickers, preview and "Reset to default".
- [ ] **Step 4: Web:** set CSS variables from the fetched theme at runtime (SSR-safe fallback to current CSS), including dark mode.
- [ ] **Step 5: Apps:** each app fetches `/settings/public` at launch, caches last theme in storage, and feeds `colors` from it; unchanged defaults when null.
- [ ] **Step 6: Verify** with a screenshot of web before/after a theme change, typecheck all apps, commit `feat(theme): super admin controls colours on web and apps`, push.

### Task 5: Pay the admin online (cash dues + subscriptions), opening on the phone

**Files:**
- Modify/Create under `autozo-backend/src/`: `services/razorpay.service.ts`, `controllers/` rider/seller/provider "pay dues" + subscription order/confirm endpoints, `models/PaymentIntent.ts`/`SubscriptionPayment.ts` reuse, webhook handler (idempotent)
- Modify: rider app, `autozo-warehouse`, `autozo-provider` wallet/dues + plan screens (Razorpay checkout via the existing in-app flow)
- Test: `autozo-backend/tests/dues-online.integration.ts`

**Interfaces:**
- Produces: `POST /rider|seller|provider/wallet/pay-dues {amount}` → Razorpay order; `POST .../pay-dues/confirm` and the webhook both call one `creditDuesPayment(paymentId)` that is idempotent and settles COD (rider) / `providerDue` / seller dues; subscription purchase uses the same order/confirm/webhook path and extends `subscriptionUntil`.

- [ ] **Step 1: Failing test:** webhook then client-confirm for the same payment credits once; wrong signature rejected; partial payment reduces dues and never below zero; subscription payment extends the plan once.
- [ ] **Step 2: Backend** endpoints + single idempotent credit function (unique index on payment id).
- [ ] **Step 3: Apps:** "Pay online" button on dues and plan screens opens Razorpay checkout directly (UPI intent on Android, SDK sheet on iOS), then refreshes balance.
- [ ] **Step 4: Admin** sees online-paid dues and subscription payments in the existing payments lists.
- [ ] **Step 5: Verify with Razorpay test-mode keys only if the admin settings hold them;** otherwise verify end to end against the signed-webhook test and state that a live test needs the owner's keys. Commit `feat(payments): riders, warehouses and providers pay the admin online`, push.

### Task 6: All apps run on iOS

**Files:**
- Create: `ios/` project for `blinkit-app-`, `autozo-provider`, `autozo-warehouse`, `autozo-backend/autozo-mobile` (scaffolded from the RN 0.87.1 template, renamed to each app's name and bundle id), `Podfile`s
- Modify: `Info.plist` usage strings (location, camera, photos, microphone), push-notification capability notes, any Android-only code behind `Platform.OS`
- Create: `.github/workflows/ios-build.yml` (macOS runner, `pod install`, unsigned simulator build per app)
- Create: `docs/IOS.md` (what the owner must supply: Apple Developer account, bundle ids, APNs key, signing)

- [ ] **Step 1: Inventory Android-only code:** `grep -rnE "PermissionsAndroid|sendIntent|Platform.OS === 'android'|NativeModules" ` in each app; list what needs an iOS branch.
- [ ] **Step 2: Scaffold `ios/`** for one app with `@react-native-community/cli init --skip-install` at the pinned version, adapt, then replicate to the others.
- [ ] **Step 3: Guard Android-only calls** and add iOS equivalents or graceful no-ops (e.g. the loud-ring service is Android-native; on iOS rely on push notification).
- [ ] **Step 4: CI job** builds all four for the simulator; commit workflow + `docs/IOS.md`.
- [ ] **Step 5: Push and read the macOS job result;** report each app as built/not built. Signing/TestFlight/APNs need the owner's Apple account and are listed as manual steps, not claimed done.

---

## Self-review

- Spec coverage: all six asks plus "every page web and app" (Task 4 steps 4–5) and iOS (Task 6) have tasks.
- Types: `deriveBrandScale`, `Settings.theme`, `creditDuesPayment`, `serviceRadiusKm` named identically wherever referenced.
- Proportion: tasks decide interfaces, tests and files; bodies are left to implementation.
- Known unknowns resolved at execution, not guessed here: exact provider service controller path (Task 2), exact rider wallet screen path (Task 1), whether Razorpay keys exist in settings (Task 5).
