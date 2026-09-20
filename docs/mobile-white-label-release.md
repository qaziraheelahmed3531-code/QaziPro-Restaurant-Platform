# Mobile white-label release template

The customer app remains one shared codebase under `apps/mobile`. A restaurant release is a build configuration, not a copied application.

## Configuration boundary

Runtime public values:

- `EXPO_PUBLIC_APP_ENV`: `development`, `staging` or `production`.
- `EXPO_PUBLIC_API_BASE_URL`: versioned `/api/v1` endpoint.
- `EXPO_PUBLIC_SUPABASE_URL` and `EXPO_PUBLIC_SUPABASE_PUBLISHABLE_KEY`: public Auth client configuration only.
- `EXPO_PUBLIC_RESTAURANT_KEY`: public restaurant key resolved by the API; never a raw `business_id`.
- `EXPO_PUBLIC_LINK_DOMAIN`: exact restaurant App/Universal Link hostname.
- `EXPO_PUBLIC_ENABLE_PUSH`: enables native token registration only after provider setup.
- `EXPO_PUBLIC_BRAND_PRIMARY`, `EXPO_PUBLIC_BRAND_SECONDARY`, `EXPO_PUBLIC_BRAND_BACKGROUND`, `EXPO_PUBLIC_BRAND_TEXT`: pre-bootstrap shell colors.

Build-time public identity:

- `MOBILE_APP_NAME`, `MOBILE_APP_SLUG`, `MOBILE_APP_SCHEME`
- `MOBILE_ANDROID_APPLICATION_ID`, `MOBILE_IOS_BUNDLE_ID`
- `MOBILE_APP_VERSION`, `MOBILE_ANDROID_VERSION_CODE`, `MOBILE_IOS_BUILD_NUMBER`
- `MOBILE_LINK_DOMAIN`
- `MOBILE_ICON_PATH`, `MOBILE_ADAPTIVE_ICON_PATH`, `MOBILE_SPLASH_IMAGE_PATH`
- `MOBILE_BRAND_PRIMARY_COLOR`, `MOBILE_BRAND_BACKGROUND_COLOR`
- `MOBILE_GOOGLE_SERVICES_FILE`: ignored/EAS file-secret path for Android Firebase client configuration.

The Android/iOS identifier and the restaurant key are deliberately separate. The identifier selects the installed app identity; the public key securely resolves the business through `/api/v1/bootstrap`.

Production profiles fail closed when identifiers are missing, a `.staging` identifier/domain is used, a non-HTTPS service is selected, or a local service address is embedded.

## Current QaziPro staging identity

- Display name: `QaziPro Restaurant Staging`
- Android: `com.qazipro.restaurant.staging`
- iOS: `com.qazipro.restaurant.staging`
- Scheme: `qazipro-restaurant`
- Version: `0.1.0`
- Android version code: `1`
- iOS build number: `1`
- Restaurant key: `qa-restaurant-a`
- Link domain: `restaurant-a.staging.qazipro.com`

Increment the marketing version only for customer-visible releases. Increment Android `versionCode` and iOS `buildNumber` for every uploaded binary, including rebuilds of the same marketing version.

## New restaurant process

1. Create the restaurant/business, branches, public key and verified domains in the existing platform.
2. Prepare a square 1024px-or-larger store icon, adaptive foreground, splash image and approved brand colors.
3. Select unique identifiers such as `com.qazipro.<restaurant-slug>` and register them in Google Play, Apple Developer and Firebase/APNs.
4. Set the runtime/build variables above in the correct EAS environment. Keep server/provider/signing credentials out of `EXPO_PUBLIC_*` values.
5. Publish matching `assetlinks.json` and `apple-app-site-association` files on the verified restaurant domain.
6. Run mobile tests, Expo Doctor, staging exports and `npm run audit:mobile-artifacts`.
7. Generate signed internal Android and iOS builds, then execute the real-device acceptance matrix.
8. Complete store metadata/privacy disclosures and release only after explicit approval.

No source folder is copied and no backend tenant logic is forked for a restaurant.
