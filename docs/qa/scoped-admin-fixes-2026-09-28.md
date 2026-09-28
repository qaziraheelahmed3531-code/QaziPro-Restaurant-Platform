# Scoped admin fixes — 28 September 2026

Scope: Restaurant Admin button contrast/loading, Super Admin permanent restaurant deletion, and QR Call a waiter. No unrelated redesign, email sends, DNS changes or production database operations.

## Root causes and changes

- Generic `.table-actions button` styling overrode primary-button backgrounds. Primary `.button` controls now retain their canonical colors, including Print QR.
- A remembered sidebar click incorrectly remained pending on QR descendants and could reappear on back navigation. Next.js `useLinkStatus` now owns the actual pending lifecycle.
- QR preview performed a second authenticated table/domain lookup after server rendering. The server generates the preview SVG once; Download SVG remains authenticated and scoped.
- New table calls use `restaurant_table_service_requests`, tenant/branch RLS and authorized RPCs, with one open request per table and cooldown protection. They appear in the existing Waiter portal, update through realtime, and have visible acknowledge/complete states plus polling/focus recovery.
- Branch `waiter_call_enabled` defaults off and is managed under Tables. Customer context comes from the canonical hostname resolver and validated public table token, never a client-provided business/branch override.
- Customer calls have duplicate guards, timeout/retry feedback, confirmed success, accessible announcements, restaurant theme colors and responsive layout. A different table resets call state.
- Public trace caught an early pre-hydration click with zero API requests. The server-rendered call control now stays disabled until its client handler is ready, without an artificial delay.
- Platform Owner deletion requires staging, exact restaurant key, typed DELETE and an audit reason. Database teardown is atomic; durable platform audit survives. A tenant-specific teardown scope reconciles existing branch/invoice guards without relaxing normal writes. Tenant UUID storage cleanup has a durable recovery manifest and honest partial/uncertain-result feedback.

## Verification

- Admin, Customer and Super Admin: lint, TypeScript and optimized build passed.
- Super Admin Vitest: 84 passing tests / 10 files.
- Customer Vitest: 12 passing tests / 3 files.
- Admin table component/browser regression: 19 passing checks.
- Isolated waiter/navigation Playwright regression: 13 passing checks, including mobile 360/390/430, tablet and desktop.
- Isolated permanent-deletion server action: 11 passing checks, including production denial, non-owner denial, typed confirmation, atomic error, uncertain response and storage failure.
- Staging SQL rollback: empty QA deletion, populated Italian Pizza deletion, other-tenant preservation, detached audit, marker spoofing rejection/cleanup and waiter deduplication/cross-tenant denial passed.
- Public HTTPS waiter acceptance: 7 passing checks for full menu/table resolution, real scoped request, duplicate HTTP request, authorized read/acknowledge/complete rollback, unauthorized denial, cross-origin/cross-tenant denial, disabled setting enforcement, responsive layout and zero runtime exceptions. Original branch setting restored; temporary table/request removed.
- Public anonymous `/waiter` and Super Admin `/restaurants` redirected to their unauthorized login states. No password-first field appeared in Restaurant Admin.
- Latest 10-minute runtime error-log scan: zero structured error entries for all three projects. This is a bounded log scan, not a claim that no errors can ever occur.

All database deletion acceptance runs end in ROLLBACK. No existing restaurant was permanently removed. No password, OTP, inbox contents or email transport was used.

## Deployment safety and remaining manual checks

Existing Admin and Customer staging Vercel projects point to approved staging Supabase. Existing canonical Super Admin project also has APP_ENVIRONMENT=staging and the approved staging database in its public deployment slot; its hostname alone does not identify a production database.

Verified READY deployments:

| Surface | Public URL | Deployment | Code commit |
| --- | --- | --- | --- |
| Restaurant Admin | https://admin.staging.qazipro.com | `dpl_8PEFFV6ZVzwJymHLusZUcuNtiL7h` | `5ba3fc769764c9eeb42ec554bce7f0b22c67991f` |
| Customer | https://italian-pizza.staging.qazipro.com (shared wildcard) | `dpl_9Wvu2QsCwpActjgYhGZzA7EY9yJ6` | `0e1c537941ea375de89a63f38149d7d30638ce08` |
| Super Admin (staging-backed) | https://superadmin.qazipro.com | `dpl_7mwLcxMqhdGSXpGE9HWZLFwAxc11` | `5ba3fc769764c9eeb42ec554bce7f0b22c67991f` |

The CLI uses Vercel's public/production deployment slot for these **verified staging-backed** projects. This is not a production Supabase deployment. No new projects or DNS changes were made. Code was deployed directly; main was not pushed because unrelated linked projects could auto-deploy.

Staging migrations for this scoped feature: `202609280002` through `202609280007`; all applied only to `jzisqjvroxodvmqxzsob`. Existing `202609280001` branch-area work was preserved.

Public authenticated portal acceptance still needs the user's own session: check Restaurant list → Manage → Permanently delete, and Tables → Call a waiter toggle → Waiter → acknowledge/complete. Do not delete a real restaurant merely to prove the control.

No connected signed-in browser surfaces were available; the browser inventory was empty. This does not block implementation, builds, public QR acceptance or database authorization tests, but it prevents claiming a logged-in visual walkthrough.

Live provider-failure cleanup and full destructive browser acceptance are not claimed. Shared platform auth accounts and detached audit history are intentionally retained. DNS/Vercel project deletion is outside this operation.

## Loading retained — follow-up correction

Loading UX is preserved, not removed. Sidebar navigation now shows the existing loader without its initial 150 ms delay when Next reports a genuine pending navigation; its 20 px slot stays stable. Completion/cancellation and resolved QR descendants remove only the pending indicator. Existing route skeletons and mutation loaders are unchanged.

QR preview now has explicit local “Preparing QR…” feedback and a disabled “Loading QR…” print button until the image is ready. Load errors stop the spinner and show a useful error. A cached inline image that completes before hydration is detected through its actual image readiness, preventing a disabled Print button or indefinite loader. Changed image sources cannot inherit another preview's loaded state.

Follow-up verification: 7 focused loading browser checks, 10 existing skeleton checks and 13 waiter/navigation regression checks passed. Admin lint, typecheck and optimized build passed. These are isolated real-browser tests, not an authenticated public portal walkthrough. No database, auth, email or waiter behavior changed in this correction.

Correction deployed READY to the existing Admin staging project: `dpl_BXK7atChjkrwLhMot4LkXRwQ2x22`, alias https://admin.staging.qazipro.com, code commit `5a729531c867fdac21231b9824cd3ce0a24d8db9`. Before deploy, the target's public slot was rechecked against the approved staging Supabase URL. No production database or unrelated app was deployed.
