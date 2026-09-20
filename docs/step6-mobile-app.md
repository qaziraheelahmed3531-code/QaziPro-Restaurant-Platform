# QaziPro customer mobile app

## Architecture

`apps/mobile` is an Expo SDK 57 / React Native application. It has one API client, one Supabase session source, one restaurant/branch context and one persistent cart. The client sends the public restaurant key and verified branch ID; it never sends a raw `business_id` or treats locally calculated totals as authoritative.

Directory layout:

- `app/`: Expo Router screens and navigation.
- `src/config`: environment boundary.
- `src/contracts`: types verified against Step 5.
- `src/lib`: API, Supabase, secure storage, notifications and safe errors.
- `src/domain`: cart, checkout idempotency, branch restore and deep-link rules.
- `src/state`: canonical app/session/bootstrap/cart provider.
- `src/ui`: shared native primitives and tokens.
- `apps/backend/src/push-worker.ts`: privileged provider worker, disabled unless explicitly configured.

## Local and staging setup

Copy `apps/mobile/.env.example` to an ignored `.env.local` and set only public client values. Android emulator local API hosts normally use `10.0.2.2`; a physical device needs a reachable HTTPS development host. Staging uses `https://qazipro-restaurant-customer-staging.vercel.app/api/v1` until exact custom DNS resolves.

Run:

```text
npm install
npm --workspace apps/mobile start
npm run test:mobile
npm run build:mobile
```

Production requires explicit `EXPO_PUBLIC_*` values. The configured fallback identifiers `com.qazipro.restaurant.staging` are development/staging placeholders and must not be published.

## Lifecycle and data rules

At launch, `/bootstrap` resolves the public restaurant key. The last branch is read from encrypted storage and accepted only if the new bootstrap still contains it. A populated cart requires confirmation before switching branches and is then cleared. Bootstrap may be cached for an offline message, while live catalog and checkout still require the server.

Supabase access and refresh tokens use Expo SecureStore backed by Android Keystore/iOS Keychain. Supabase refresh follows app foreground/background state. API `401` handling signs out the local invalid session. Login, signup, verification, password reset and global logout are implemented. Password-reset requests use the enumeration-safe Step 5 endpoint.

Cart persistence stores product, variant, modifier, restaurant and branch identifiers. It stores no access token. Before checkout it is validated against the current catalog. A checkout attempt is persisted with its payload fingerprint and idempotency key; timeouts reuse that exact attempt, payload changes create a new attempt, and the cart is cleared only after a successful server response.

Cart lines can be edited without creating a duplicate line. Promotions come from `/promotions`, and checkout enables COD only when `/payments` advertises `CASH_ON_DELIVERY`. Client prices remain estimates; the returned order contains the authoritative total.

Delivery location is requested only from checkout/address actions. The device coordinates are sent to `/delivery/quote`; its returned delivery area and fee are display data until checkout recalculates everything. Because the staging Geoapify key is missing, staging delivery quote, address creation and delivery checkout remain externally blocked; pickup checkout remains usable. The frozen API does not expose a provider-independent delivery-area listing, so the client cannot safely invent an area ID.

Order tracking polls every 15 seconds only while the screen/app is active and the order is non-terminal. Cancellation is committed only after server confirmation. Reorder uses the API reorder identifiers and rebuilds the cart from the current catalog, skipping stale items/options.

## Push delivery

The app requests notification permission only when the signed-in customer taps Enable. It obtains the native FCM/APNs device token and registers it through `/devices`. Logout can remove the installation association.

The backend worker claims pending outbox rows, loads active tokens for the same restaurant/customer, sends via FCM HTTP v1 or APNs HTTP/2, records success/failure, retries with bounded exponential delay, stops after five attempts, and disables permanently invalid tokens. It is fail-closed when `PUSH_WORKER_ENABLED` is not `true`.

Required server-only variables are documented in `apps/backend/.env.push.example`. Schedule `npm --workspace apps/backend run push:worker` on a trusted worker/cron runtime. Never place those variables in Expo or any `EXPO_PUBLIC_*` variable.

Real push delivery is blocked until FCM and APNs credentials plus final bundle identifiers are supplied. Expo Go is insufficient for Android remote push; use a development build or signed internal build.

## Deep links

The app handles cold/warm links for `auth/callback` and `orders/{orderNumber}` using the custom staging scheme. Order links only navigate; the destination still fetches authorized data using the Bearer token or encrypted guest tracking token. Notification payload data is likewise treated as a navigation hint.

Android App Links and iOS Universal Links are configured against `EXPO_PUBLIC_LINK_DOMAIN`. Association templates live in `docs/mobile-link-association-templates`. Replace placeholders only after the final Android package, signing certificate SHA-256 and Apple Team/bundle IDs are decided, then publish them under `/.well-known/` on the restaurant domain. Exact-domain validation remains blocked by `restaurant-a.staging.qazipro.com` NXDOMAIN.

## Release prerequisites

- Decide final Android application ID and iOS bundle ID.
- Configure signing, FCM service account, APNs key/team/topic, and a trusted push-worker schedule.
- Add a staging-restricted Geoapify key and rerun delivery flows.
- Resolve staging DNS and publish signed-link association files.
- Run Android emulator/physical-device checks and iOS Simulator/TestFlight checks.
- Perform accessibility checks with TalkBack and VoiceOver.
- Keep COD as the only advertised payment until `/payments` enables another provider.

## Step 6 verification evidence

- Mobile domain/API tests: 44/44 pass.
- Push-worker safety tests: 3/3 pass.
- Expo Doctor: 21/21 pass.
- Android and iOS Hermes export bundles: pass.
- Public staging API acceptance: 14/14 pass.
- Public tenant/branch/checkout regression: 22 pass, 1 Geoapify-dependent skip.
- POS/offline regression: 17/17 pass.
- Mobile RLS/outbox SQL: pass; database lint and migration dry-run: pass/up to date.
- Customer, Admin, Backend and Desktop POS production builds: pass.

Native signed binaries, emulator/physical-device UI, real FCM/APNs delivery, TalkBack/VoiceOver, and exact-domain App/Universal Links were not falsely marked as passed. They remain external validation work because this Windows environment has no Android SDK/device or Apple toolchain, credentials/final identifiers are absent, and staging DNS is unresolved.
