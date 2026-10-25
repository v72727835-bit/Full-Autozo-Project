# Build all three APKs with one command

One command builds the release APKs of the customer app, the warehouse app and the rider app, with the latest `main`,
and copies them into the `apks` folder at the repo root:

| App | Folder | APK |
| --- | --- | --- |
| Customer | `blinkit-app-` | `apks\autozo-customer.apk` |
| Warehouse | `autozo-warehouse` | `apks\autozo-warehouse.apk` |
| Rider | `autozo-backend\autozo-mobile` | `apks\autozo-rider.apk` |

## Windows

```
cd C:\bingoor-project
build-apks.bat
```

- Only one app: `build-apks.bat rider` (or `customer`, `warehouse`).
- Skip `git pull`: `build-apks.bat nopull`.

Mac / Linux: `bash build-apks.sh` (same options).

The first build takes 15-30 minutes (Gradle downloads a lot); later builds are much faster.
If one app fails, the others still build and the script says which one failed at the end.

## One-time setup

1. **Node 20+**, **JDK 17** and **Android Studio** (it installs the Android SDK). Set `ANDROID_HOME` to the SDK folder,
   usually `C:\Users\<you>\AppData\Local\Android\Sdk`. `JAVA_HOME` must point to JDK 17.
2. Keep the repo at a short path such as `C:\bingoor-project` (long paths break native builds on Windows).
3. **Firebase file** (for OTP login and push). Download `google-services.json` from Firebase for each Android app and put it here:
   - `com.bingoor.app` → `blinkit-app-\android\app\google-services.json`
   - `com.bingoor.warehouse` → `autozo-warehouse\android\app\google-services.json`
   - `com.bingoor.rider` → `autozo-backend\autozo-mobile\android\app\google-services.json`

   They are committed (the repo is private; one file from the `autozo-app` Firebase project covers all three apps).
   Re-download and replace them if you add or change an app in Firebase.
4. **SHA-1 in Firebase**. All three apps are signed with the same `debug.keystore` (in each `android\app` folder).
   Add these fingerprints to each of the three Android apps in Firebase (Project settings → your app → Add fingerprint):
   - SHA-1: `5E:8F:16:06:2E:A3:CD:2C:4A:0D:54:78:76:BA:A6:F3:8C:AB:F6:25`
   - SHA-256: `FA:C6:17:45:DC:09:03:78:6F:B9:ED:E6:2A:96:2B:39:9F:73:48:F0:BB:6F:89:9B:83:32:66:75:91:03:3B:9C`

   To check them yourself: `keytool -list -v -keystore blinkit-app-\android\app\debug.keystore -alias androiddebugkey -storepass android`

## Notes

- The API URL baked into the apps is in each app's `src/config.ts` (`https://app-api.autozo.org/api/v1`).
- The debug keystore is fine for sharing APKs directly. For the Play Store, make a real upload keystore first
  (https://reactnative.dev/docs/signed-apk-android) and keep it safe; an app signed with one key cannot be updated
  with an APK signed by a different key.
- The cPanel server cannot build Android apps; build on your own PC.

## Without a PC: GitHub Actions

`.github/workflows/build-apks.yml` builds all three APKs on GitHub's servers whenever app code changes on `main`
(or by hand: GitHub → Actions → Build APKs → Run workflow). It takes about 15-25 minutes.

- Download: GitHub → Releases → newest "Autozo APKs", or always-newest links:
  `https://github.com/v72727835-bit/bingoor-project/releases/latest/download/autozo-customer.apk`
  (`autozo-warehouse.apk`, `autozo-rider.apk`). The repo is private, so these links need your GitHub login.
- Firebase: add secrets `GOOGLE_SERVICES_CUSTOMER`, `GOOGLE_SERVICES_WAREHOUSE`, `GOOGLE_SERVICES_RIDER`
  (GitHub → repo Settings → Secrets and variables → Actions → New repository secret; paste the whole
  `google-services.json` text). Optional `MAPS_API_KEY` for the rider map. Without them the APKs still build.

## Public download links on the website

Every build on `main` also force-pushes the three APKs to the `apk-builds` branch. On the server, `deploy.sh`
runs `update-apks.sh`, which copies them to `autozo-backend/downloads/`, served publicly at:

- https://app-api.autozo.org/downloads/autozo-customer.apk
- https://app-api.autozo.org/downloads/autozo-warehouse.apk
- https://app-api.autozo.org/downloads/autozo-rider.apk

The website links to these in the footer ("Get the app"), the Seller / Rider menu, the delivery partner page and the
warehouse registration page. A link set in Admin → Store settings → App links (e.g. a Play Store listing) wins.

With the SSH secrets from `deploy.yml` set, the build also runs `update-apks.sh` on the server by itself. Otherwise, after a merge wait for the "Build APKs" run to finish (about 25 minutes), then deploy, or refresh only the APKs
any time with `bash ~/bingoor-project/update-apks.sh` (no restart needed).
