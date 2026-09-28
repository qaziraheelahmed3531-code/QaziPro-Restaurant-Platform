# Scoped admin fixes — 28 September 2026

Scope: Restaurant Admin button contrast/loading, Super Admin permanent restaurant deletion, and QR Call a waiter. No unrelated redesign, email sends, DNS changes or production database operations.

## Root causes and changes

- Generic `.table-actions button` styling overrode primary-button backgrounds. Primary `.button` controls now retain their canonical colors, including Print QR.
- A remembered sidebar click incorrectly remained pending on QR descendants and could reappear on back navigation. Next.js `useLinkStatus` now owns the actual pending lifecycle.
- QR preview performed a second authenticated table/domain lookup after server rendering. The server generates the preview SVG once; Download SVG remains authenticated and scoped.
- New table calls use `restaurant_table_service_requests`, tenant/branch RLS and authorized RPCs, with one open request per table and cooldown protection. They appear in the existing Waiter portal, update through realtime, and have visible acknowledge/complete states plus polling/focus recovery.
- Branch `waiter_call_enabled` defaults off and is managed under Tables. Customer context comes from the canonical hostname resolver and validated public table token, never a client-provided business/branch override.
- Customer calls have duplicate guards, timeout/retry feedback, confirmed success, accessible announcements, restaurant theme colors and responsive layout. A different table resets call state.
- Platform Owner deletion requires staging, exact restaurant key, typed DELETE and an audit reason. Database teardown is atomic; durable platform audit survives. A tenant-specific teardown scope reconciles existing branch/invoice guards without relaxing normal writes. Tenant UUID storage cleanup has a durable recovery manifest and honest partial/uncertain-result feedback.

## Verification

- Admin, Customer and Super Admin: lint, TypeScript and optimized build passed.
- Super Admin Vitest: 84 passing tests / 10 files.
- Customer Vitest: 12 passing tests / 3 files.
- Admin table component/browser regression: 19 passing checks.
- Isolated waiter/navigation Playwright regression: 13 passing checks, including mobile 360/390/430, tablet and desktop.
- Isolated permanent-deletion server action: 11 passing checks, including production denial, non-owner denial, typed confirmation, atomic error, uncertain response and storage failure.
- Staging SQL rollback: empty QA deletion, populated Italian Pizza deletion, other-tenant preservation, detached audit, marker spoofing rejection/cleanup and waiter deduplication/cross-tenant denial passed.
- Earlier public staging QR call acceptance reached the scoped pending queue. Branch flag and temporary call were restored/removed afterward.

All database deletion acceptance runs end in ROLLBACK. No existing restaurant was permanently removed. No password, OTP, inbox contents or email transport was used.

## Deployment safety and remaining manual checks

Existing Admin and Customer staging Vercel projects point to approved staging Supabase. Existing canonical Super Admin project also has APP_ENVIRONMENT=staging and the approved staging database in its public deployment slot; its hostname alone does not identify a production database.

Public authenticated portal acceptance still needs the user's own session: check Restaurant list → Manage → Permanently delete, and Tables → Call a waiter toggle → Waiter → acknowledge/complete. Do not delete a real restaurant merely to prove the control.

Live provider-failure cleanup and full destructive browser acceptance are not claimed. Shared platform auth accounts and detached audit history are intentionally retained. DNS/Vercel project deletion is outside this operation.
