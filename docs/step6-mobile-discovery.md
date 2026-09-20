# Step 6 mobile discovery

Baseline: commit `17d822b`, tag `step5-mobile-api-contract-20260920`, clean working tree. The Step 5 API, OpenAPI, migration, security tests and server-authoritative checkout were inspected before implementation. The baseline customer/admin/backend/desktop lint and builds passed.

No native mobile project, Android application ID, iOS bundle ID, FCM configuration, APNs configuration, Android SDK or iOS build environment existed. The repository is an npm TypeScript workspace using React 19, shared TypeScript packages, Supabase Auth and a Next.js `/api/v1` boundary.

Expo React Native was selected because it fits the existing TypeScript/React workspace and provides Android/iOS navigation, encrypted native storage, lifecycle-aware auth refresh, deep links, location and native notification tokens without creating two unrelated client implementations. Expo Router is used only for native navigation. Commerce continues through the frozen `/api/v1` contract.

Existing web components were used as UX reference only. No customer web, Admin, POS, tenant, branch, RLS, order or checkout implementation was copied or replaced.

Known pre-implementation external gates remain: staging Geoapify key, FCM/APNs credentials, final bundle identifiers, exact staging DNS, Apple/Xcode environment, Android SDK/device and private Git remote.
