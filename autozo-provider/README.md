# Autozo Service Provider app

React Native app for **service providers**. A provider signs in with the
phone + password the super admin created for them (or that they set at
registration, once an admin approves it) and can:

- see their **status** (approved / online) and a dashboard of their services,
  bookings and earnings,
- go **online / offline**,
- add and manage **services** — title, price, price unit, duration, weekly
  available days and service radius,
- see **all their bookings** with full customer + address detail and move each
  one through `accepted → on the way → in progress → completed` (with the
  customer's completion OTP),
- get the **live booking ring**: when a customer books nearby, the app buzzes
  with a full-screen card until the provider accepts or dismisses it.

It talks to the same API as the other apps (`app-api.autozo.org/api/v1`) using
the `/provider/*` endpoints. Package id `com.bingoor.provider`.

## Run it

```
npm install
npm run android
```

## Build the APK

The release APK is built in CI by `.github/workflows/build-apks.yml` (the
`provider` matrix entry). Set the **`GOOGLE_SERVICES_PROVIDER`** repository
secret to the Firebase `google-services.json` for `com.bingoor.provider`
(push / phone OTP need it; the booking ring itself works without it, over
polling + vibration).
