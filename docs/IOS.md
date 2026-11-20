# Autozo apps on iOS

All four React Native apps (customer, provider, warehouse, rider) now have an `ios/` project next to
their `android/` one. The JavaScript was already written for both platforms (Android-only calls are
behind `Platform.OS`, and the loud ring falls back to vibration).

| App | Folder | Xcode scheme | Bundle id |
|---|---|---|---|
| Customer | `blinkit-app-` | `AutozoApp` | `org.autozo.customer` |
| Provider | `autozo-provider` | `AutozoProvider` | `org.autozo.provider` |
| Warehouse | `autozo-warehouse` | `AutozoWarehouse` | `org.autozo.warehouse` |
| Rider | `autozo-backend/autozo-mobile` | `AutozoApp` | `org.autozo.rider` |

## What is checked automatically

`.github/workflows/ios-build.yml` builds the apps for the iOS **Simulator**, unsigned, on a macOS
runner (`pod install` + `xcodebuild`). A pull request builds the customer app; run the workflow by
hand with *app = all* to build the other three. A green run means the app compiles and bundles on
iOS. It is **not** an installable app: nobody has run these on an iPhone yet.

## What only you can do (needs your Apple / Firebase accounts)

1. **Apple Developer account** (paid, USD 99 a year) and, per app, an App ID with the bundle id above
   (or change `PRODUCT_BUNDLE_IDENTIFIER` in `ios/<scheme>.xcodeproj/project.pbxproj`).
2. **Signing**: open `ios/<scheme>.xcworkspace` in Xcode on a Mac, pick your team under
   *Signing & Capabilities*. Then archive and upload to TestFlight / the App Store.
3. **Push notifications (and Firebase phone sign-in on the customer app)**
   - In Firebase, add an iOS app for each bundle id and download its `GoogleService-Info.plist`.
   - Drag it into the Xcode project (target membership ticked). Until it is there Firebase is not
     started, the app still runs, and push / phone sign-in are simply off.
   - Upload your APNs key (Apple Developer > Keys) to Firebase > Project settings > Cloud Messaging.
   - Enable the *Push Notifications* capability (the entitlement file is already in place).
4. **App icon**: the one in `Images.xcassets` is a placeholder enlarged from the Android icon. Replace
   `AppIcon-1024.png` with a real 1024 x 1024 PNG (no transparency) before submitting.
5. **Rider ring**: Android rings loudly through a native service. iOS cannot ring while the app is
   closed the same way; the rider gets the normal push notification and the in-app ring while open.

## Building on a Mac

```bash
cd <app folder> && npm install
cd ios && pod install
open <scheme>.xcworkspace
```
