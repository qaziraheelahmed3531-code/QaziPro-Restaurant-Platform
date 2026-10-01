# QaziPro Operations access and release runbook

The mobile codebase produces one **QaziPro Operations** app. Restaurant Admin,
Waiter and Rider are server-resolved shells inside that app; installing a
different binary does not grant another role.

## Access lifecycle

1. QaziPro Super Admin enables `mobile.android` and/or `mobile.ios` for the
   restaurant, plus the required `admin.restaurant`, `waiter` or `rider`
   capability.
2. The restaurant owner/manager opens **Restaurant Admin → Apps & Access →
   Manage staff & branch access**.
3. They invite or edit a staff account and assign `OWNER`/`MANAGER`, `WAITER`
   or `RIDER`, with the permitted branches.
4. Staff installs QaziPro Operations and signs in. The app asks the canonical
   access resolver for membership, `business_id`, branches, permissions and
   live entitlements. It fails closed if any layer is inactive or revoked.
5. A role or entitlement change takes effect on the next authorization refresh;
   the client cannot promote itself.

## One-time EAS setup

Run from `apps/mobile`:

```powershell
npx eas-cli@latest login
npx eas-cli@latest whoami
npx eas-cli@latest init
```

`eas init` links the existing Expo project and supplies `EAS_PROJECT_ID`. Do
not create a second Expo project if QaziPro Operations already exists—select
the existing project. Store the project id as an EAS environment variable for
the preview environment if CI supplies the config dynamically.

## Android tablet

Direct staging installation uses an APK:

```powershell
npm run eas:operations:apk
```

Open the EAS build URL on the Android tablet, download the APK and allow the
one-time "install unknown apps" prompt. For Google Play internal testing, build
the AAB and submit it through the existing Play Console app:

```powershell
npm run eas:operations:aab
npx eas-cli@latest submit --platform android --profile operations-android-play
```

An AAB cannot be installed directly. After a verified APK or Play testing URL
exists, set `QAZIPRO_OPERATIONS_ANDROID_APK_URL` or
`QAZIPRO_OPERATIONS_ANDROID_PLAY_URL` in Restaurant Admin and redeploy; **Apps
& Access** will expose the real link and QR code.

## iPhone and iPad

For registered QA devices, create an ad-hoc internal build. Apple Developer
membership and the device UDID are required:

```powershell
npx eas-cli@latest device:create
npm run eas:operations:ios:internal
```

For TestFlight, create a store-signed build and submit it:

```powershell
npm run eas:operations:ios:testflight
npx eas-cli@latest submit --platform ios --profile operations-ios-testflight
```

Set `QAZIPRO_OPERATIONS_IOS_TESTFLIGHT_URL` (or the final App Store URL) in
Restaurant Admin after Apple makes it real. iOS has no safe public APK-style
direct installation; testers install through TestFlight, or through an
ad-hoc URL only when their UDID is registered.

## Release safety

- Current profiles point to staging services and use staging bundle IDs.
- Do not submit a staging build as a production release.
- Store signing, Apple/Google accounts and live push credentials are external
  acceptance requirements, not reasons to leave the application code fake.
- Never place an unverified URL in the download center. Without a configured
  HTTPS URL, the UI deliberately displays **Publication pending**.
