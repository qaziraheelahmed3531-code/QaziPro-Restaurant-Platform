# Connected experience delta: Super Admin navigation

Staging/dev only. Canonical GitHub main preserved. No provider credentials or
authentication codes are captured in this report.

## Root causes and changes

- Each protected page owned its shell. Moving protected routes into the
  URL-neutral `(platform)` layout preserves sidebar/header and collapse state.
- Root/onboarding `loading.tsx` fallbacks replaced useful content on navigation.
  Explicit stable Suspense boundaries retain initial-load skeleton support
  without resetting every client transition.
- Restaurant 360 keyed its boundary by both restaurant and tab. It now resets
  for a different restaurant only, retaining section data while a tab resolves.
- Navigation uses fixed-size `useLinkStatus` feedback, delayed for fast changes
  and static with reduced motion. Form mutations retain existing local pending
  states and server authorization.
- Request-scoped platform authorization remains in every page/action. A shared
  layout is not treated as the authorization boundary.
- Shared package now owns its TypeScript configuration, avoiding accidental
  inheritance of an unrelated root Astro configuration.

## Evidence

- Super Admin optimized build: PASS; public paths unchanged.
- Super Admin lint: PASS.
- Super Admin unit tests: 84 passed.
- `scripts/test-super-admin-navigation.mjs`: 14 browser checks passed against
  local optimized app with the verified staging database. RSC responses were
  deliberately held to assert old content, sidebar identity and collapse state
  survive slow navigation. Includes Restaurant 360 tabs, back navigation,
  mobile 360/390/768 focus/inert/overflow checks and zero runtime errors.
- Temporary confirmed-password QA identity used; no invitation/email transport.
  Fixture identity removed afterwards, business records unchanged.

This does NOT claim real Google/OTP acceptance or public deployment acceptance.
QR ordering, browser push, full connected E2E and public performance remain
separate workstreams; the overall connected gate is not PASS.
