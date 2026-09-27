# Customer master gate — Phase 0 evidence, 27 September 2026

QAZIPRO RESTAURANT WEBSITE FINAL GATE: **FAIL**

This is a blocked prerequisite handoff, not a completed Customer redesign. Below, FAIL for an untested requirement means the acceptance gate has not passed; it does not assert a reproduced product defect.

## Phase 0

PHASE 0 RESTAURANT ADMIN CLOSURE: **FAIL** — real authenticated acceptance is pending.

ADMIN DEPLOYMENT: **READY**

- Existing project: `qazipro-restaurant-admin-staging`.
- Deployment: `dpl_6D3X399jCmGMLB8CFy1U2cjedPft`.
- Artifact: `https://qazipro-restaurant-admin-staging-9kwpt37ru.vercel.app`.
- Public alias: `https://admin.staging.qazipro.com`.
- Deployed commit: `b8886be2fb8577f45c2b04f4a8819c86e3933077`.
- Verified application environment is staging and Supabase project is `jzisqjvroxodvmqxzsob`. Vercel's primary deployment target is named production inside this dedicated staging project; this is not the production application/database.

GOOGLE AUTH REAL ACCEPTANCE: **FAIL** — initiation successfully reaches Google with the staging Supabase callback and no URL error. No real account sign-in or membership/session acceptance was completed.

8-DIGIT OTP REAL ACCEPTANCE: **FAIL** — no approved recipient was supplied; no OTP was requested. Delivery, acceptance, resend, invalid/expired codes, authenticated owner access, session restore and logout remain unverified publicly.

EMAIL REAL ACCEPTANCE: **PROVIDER BLOCKED** — Admin deployment does not have SMTP configuration. Real acceptance also requires an explicitly approved real recipient. Supabase Auth's email provider is separate; missing Admin SMTP does not establish that Supabase OTP delivery is broken.

## Reference research

REFERENCE RESEARCH: inspected the public Indolj home/product pages (`https://indolj.pk/`, `https://indolj.com/online-ordering.php`) and representative frames of the supplied AZ Food recording. These are references only; no proprietary assets were incorporated into application code.

REFERENCE VIDEO: **INSPECTED** — representative frames across the 68.54-second `AZ Food - Google Chrome 2026-09-27 13-24-15.mp4`. Observed location/mode selection, category rail, product cards, right-side cart, sticky cart affordance and checkout. Still frames do not establish exact motion timing or mobile behavior.

## Customer acceptance matrix

Main Customer implementation and public end-to-end acceptance have not started because the brief requires closing Phase 0 first. All statuses below are unmet gates, not claims that every existing feature is broken.

| Required section | Status |
| --- | --- |
| DESIGN SYSTEM | FAIL |
| RESTAURANT BRAND THEMING | FAIL |
| COLORS / CONTRAST | FAIL |
| HERO | FAIL |
| FLUID MOTION | FAIL |
| MICRO-ANIMATIONS | FAIL |
| KINETIC TYPOGRAPHY | FAIL |
| BUTTON SHEEN | FAIL |
| SCROLL EXPERIENCE | FAIL |
| SHIMMER / SKELETON | FAIL |
| MENU | FAIL |
| PRODUCT DETAILS | FAIL |
| CART DRAWER / MOBILE CART | FAIL |
| CHECKOUT | FAIL |
| DELIVERY | FAIL |
| PICKUP | FAIL |
| QR TABLE | FAIL |
| DINE-IN CONTEXT | FAIL |
| ORDER IDEMPOTENCY | FAIL |
| REALTIME ORDER STATUS | FAIL |
| REVIEWS | FAIL |
| PUSH PERMISSION | FAIL |
| PUSH DELIVERY | FAIL |
| PUSH DEEP LINKS | FAIL |
| EMAIL DELIVERY | FAIL |
| EMAIL DEEP LINKS | FAIL |
| SEO | FAIL |
| ACCESSIBILITY | FAIL |
| MOBILE | FAIL |
| TABLET | FAIL |
| DESKTOP | FAIL |
| TENANT ISOLATION | FAIL |
| BRANCH ISOLATION | FAIL |
| CACHE ISOLATION | FAIL |
| ADMIN ↔ WEBSITE | FAIL |
| SUPER ADMIN ↔ WEBSITE | FAIL |

## Verification performed

PLAYWRIGHT: local Admin email suite passed (13 server tests, 6 browser tests). Complete public authenticated E2E has not passed. Public read-only login checks were performed with agent-browser.

Other checks this run:

- Super Admin tests: 84 passed across 10 files, including invitation suppression coverage.
- Backend tests: 3 passed.
- Admin lint: passed.
- Admin production build/type checking: passed.
- Customer production build: passed.
- Super Admin production build: passed.
- Backend TypeScript build: passed.
- Git diff whitespace check: passed.
- No real emails were sent during automated tests.

PUBLIC URLs TESTED:

- `https://admin.staging.qazipro.com/login`: current Google/OTP UI loaded.
- `https://admin.staging.qazipro.com/orders`: logged-out request redirected to `/login?error=unauthorized`. This does not prove authenticated unauthorized-account denial.
- Google initiation reached `https://accounts.google.com/v3/signin/identifier` with redirect URI `https://jzisqjvroxodvmqxzsob.supabase.co/auth/v1/callback`. No credentials entered.

Public login layout checks: no horizontal overflow at widths 360, 768 and 1440. Manual showcase selection changed the panel correctly. Reduced-motion preference disables automatic rotation. These checks do not certify every Admin page or Customer responsive behavior.

LIGHTHOUSE / PERFORMANCE: not measured; no scores claimed.

CONSOLE ERRORS: no browser errors reported during the checked login, protected-route redirect and Google initiation journey.

RUNTIME ERRORS: none observed in that limited public journey; authenticated and Customer runtime paths are not certified.

## Changes and safety

FILES CHANGED in the new fix commit:

- `packages/shared/src/email-safety.ts`: reserved `.invalid` and all its subdomains now always suppress external delivery, alongside existing explicitly synthetic domains.
- `apps/super-admin/lib/invitation-delivery.test.ts`: arbitrary/nested/case-normalized `.invalid` coverage.
- `apps/admin/scripts/test-customer-broadcast-safety.mjs`: all-synthetic batch regression and mock-only non-synthetic recipient correction.

Previously completed Admin commits `3a6dd7d` and `7f916978` were also pushed with this work; see `restaurant-admin-login-email-progress-20260927.md` for their implementation scope. Unrelated user changes in `apps/super-admin/package.json` and `package-lock.json` were preserved and excluded.

MIGRATIONS: applied existing `202609270006_customer_broadcast_safe_retries.sql` to staging only after linked-project verification and dry run. No additional migration was invented.

STAGING DATA CHANGED: schema/function migration only. Post-checks confirmed the request-key column, idempotent RPC, removal of stale automatic retry and enabled RLS. Campaign and delivery counts remained zero. No customer/order/restaurant fixture mutations were made.

Restore point: local Git tag `phase0-admin-pre-migration-20260927`.

COMMIT SHA: `b8886be2fb8577f45c2b04f4a8819c86e3933077` — pushed to canonical `origin/main`.

VERCEL DEPLOYMENT: **READY** — Admin artifact above.

Production database, live website, DNS and app stores were not changed.

## Remaining blockers and next manual check

1. User must designate an approved real staging inbox. Do not use synthetic addresses and do not expose credentials or OTPs in committed files.
2. Configure the existing Admin SMTP transport securely on the staging project: `SMTP_HOST`, `SMTP_PORT`, `SMTP_USER`, `SMTP_PASSWORD`, `SMTP_FROM`, following the existing implementation. No second email provider/system is required.
3. User-assisted real Google sign-in and 8-digit OTP acceptance, including resend/invalid/expired behavior, owner authorization, unauthorized-account denial, restore and logout.
4. One explicitly approved real email campaign: confirm delivery and correct restaurant deep link, then verify retry/double-submit does not deliver duplicates.
5. Once Phase 0 passes, continue the complete Customer audit/design/implementation and all required public, security, responsive and performance acceptance. None of these later gates is represented as completed here.
