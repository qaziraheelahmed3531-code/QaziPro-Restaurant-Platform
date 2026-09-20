# Step 7 mobile release integration

## Frozen foundations

Step 6 freeze `eaae1e464630711d4095cfa5cca5a839a0928c78` / `step6-native-mobile-app-20260920` was clean and matched before Step 7. The frozen `/api/v1` contract and Step 5 migration remain unchanged.

## Release configuration

- Staging Android/iOS ID: `com.qazipro.restaurant.staging`.
- Marketing version: `0.1.0`; Android version code: `1`; iOS build number: `1`.
- `development`, `staging`, `ios-simulator` and `production` EAS profiles are separated.
- Staging is visibly named `QaziPro Restaurant Staging`.
- Production refuses staging identifiers/domains and local or non-HTTPS service URLs.
- Icons and splash use the existing 512x512 QaziPro logo. Store submission still needs an approved 1024px-or-larger source asset and device screenshots.
- Permissions: foreground coarse/fine location for requested delivery validation and notifications for opt-in order updates. Contacts, camera and microphone are not requested.

The Windows host has no Android SDK/AVD, connected Android/iOS device, macOS/Xcode or Apple signing environment. Signed binaries and executable device validation therefore remain external rather than being marked as passed.

## DNS and HTTPS

All three custom staging hostnames remain NXDOMAIN. Per the frozen Step 4 Vercel plan, create DNS-only records at the current `qazipro.com` DNS provider:

| Type | Host | Value |
| --- | --- | --- |
| A | `restaurant-a.staging` | `76.76.21.21` |
| A | `restaurant-b.staging` | `76.76.21.21` |
| A | `admin.staging` | `76.76.21.21` |

Leave any proxy disabled until Vercel verifies each alias and issues HTTPS. Then validate DNS, certificate, tenant A/B resolution, admin, API, auth callbacks and unknown-domain fail-closed behavior. No DNS change was made in Step 7.

## External provider setup

### Geoapify

No staging credential is present. Configure the existing server-side staging variable documented by the location runbook, apply provider restrictions, then rerun address → quote → distance → fee → delivery checkout. Pickup and COD remain available.

### Android FCM

1. Create/select the Firebase Android app for `com.qazipro.restaurant.staging`.
2. Supply `google-services.json` as an ignored local file or EAS file variable referenced by `MOBILE_GOOGLE_SERVICES_FILE`.
3. Set `EXPO_PUBLIC_ENABLE_PUSH=true` only in the tested preview environment.
4. Set backend-only `FCM_PROJECT_ID`, `FCM_CLIENT_EMAIL`, `FCM_PRIVATE_KEY`, Supabase server values and `PUSH_WORKER_ENABLED=true` in the trusted worker runtime.
5. Never place the Firebase service-account key in the mobile/EAS public environment.

### iOS APNs

Register the bundle/App ID, enable push capability, supply Apple Team/Key IDs and `.p8` content only to the trusted worker/EAS credential store, then set backend-only `APNS_TEAM_ID`, `APNS_KEY_ID`, `APNS_PRIVATE_KEY`, `APNS_BUNDLE_ID` and environment. A real eligible iOS device is required for delivery proof.

## Signing and build commands

After linking the repository to the correct Expo organization and configuring Preview environment public variables:

```text
npx eas-cli build --platform android --profile staging
npx eas-cli build --platform android --profile production
npx eas-cli build --platform ios --profile ios-simulator
npx eas-cli build --platform ios --profile staging
```

Use EAS-managed credentials or an approved organization keystore/certificates. Never commit credentials. The production profile deliberately fails until non-staging identifiers, domains and environment variables are provided.

## Link association

Templates live in `docs/mobile-link-association-templates`. Android still needs the real signing certificate SHA-256 and Apple still needs the Team ID. Publish under `/.well-known/` only after DNS resolves, then prove browser/email-to-app handoff; template presence alone is not a pass.

## Dependency risk

Current audit advisories are moderate transitive Expo/tooling paths. The available automatic remediation proposes an incompatible Expo/router downgrade, so no forced downgrade is accepted. Recheck on each compatible Expo SDK patch and before store upload.

At verification there were 14 moderate, 0 high and 0 critical production-dependency advisories. `expo install --check` reported the SDK dependencies compatible and up to date.

## Acceptance status

Automated configuration, security and export checks are recorded in the Step 7 Git report. Emulator/physical-device, signed artifacts, real provider delivery, password-reset email handoff and HTTPS domain association stay `BLOCKED` or `NOT TESTED` until their named account, credential, DNS or device dependency exists.

Verified locally/public staging before freeze: 56/56 mobile tests, 3/3 push-worker tests, 21/21 Expo Doctor checks, complete Customer/Admin/Backend/Desktop/Mobile builds, Android/iOS Hermes exports, clean install, exported-artifact scan, linked database lint and migration dry-run. Public smoke tests resolved both QA restaurants, rejected an unknown restaurant and cross-tenant branch, exposed only COD, and returned `401 INVALID_ACCESS_TOKEN` for invalid Bearer access to profile, addresses, orders and devices. Password-reset initiation returned the same enumeration-safe `202` envelope for two nonexistent staging addresses; email-to-device completion could not be tested without the external email/device setup.
