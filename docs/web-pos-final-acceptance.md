# QaziPro Web POS acceptance — 2026-09-30

## Outcome: PARTIAL, staging READY

The implemented cashier, payment, QR and realtime workflows passed the recorded checks. This is not a blanket completion claim for every item in the 66-case master matrix: performance targets and physical-device acceptance remain open.

- Canonical application: `apps/admin`, route `/pos`.
- Public staging: https://admin.staging.qazipro.com/pos
- Project: `qazipro-restaurant-admin-staging`, `prj_TuSSIaWALfAprlq5W9sBd3G3FgBF`.
- Deployed commit: `7b462886ae0d580ba7fe470e56939f256ee642d4`.
- Deployment: `dpl_5eG5QjbpzzDE5kR2GT1sf9YGTBRx`, READY.
- Immutable URL: https://qazipro-restaurant-admin-staging-eezql0mgr.vercel.app
- Next.js 16.3.4; latest remote build-output step completed in 34 seconds.
- Vercel's `production` target is the alias slot of this explicitly verified **staging project**, not the production restaurant application. No git push, production deployment, production database or DNS changes.
- Inspected deployment output confirms `/pos` and `/pos.rsc` run in `bom1`; `/kitchen` remains in `iad1`. Only the POS function was relocated. The canonical staging database is in `ap-south-1`.

## Recorded verification

| Suite | Result | Evidence scope |
| --- | --- | --- |
| `test-pos-experience.mjs` | 31 passed, 0 failed | Real React/Chromium with isolated transport fixtures; not live payments |
| `test-pos-table-queue.mjs` | 3 passed, 0 failed | Stable incoming bill layout, native keyboard disclosure, duplicate-click guard |
| `test-pos-notification-sound.mjs` | Passed | WAV validation, fallback/denial, real Chrome decode/play; speakers not tested |
| `test-pos-staging.mjs https://admin.staging.qazipro.com` | 22 passed, 0 failed | Real public staging browser, Supabase, customer storefront, KDS and payment ledger |
| `test-pos-database.mjs --deployed` | Passed | Transactional staging SQL assertions; all test data rolled back |
| Admin build / TypeScript / lint | Passed | No build/type/lint failure |

Latest public recording: `2026-09-30T11:37:16.243Z`. Sanitized machine-readable measurements are in ignored `test-results/pos/public-evidence.json`; screenshot `test-results/pos/staging-pos.png`. No authentication storage or credential-bearing trace is saved. Isolated suite failures capture screenshot/trace; public failures capture screenshots without authentication state.

### Live public checks

Authenticated branch-scoped bootstrap; rapid add; hold/resume; UI cash sale with server tax; one payment ledger entry; persisted receipt/browser print path; POS order to KDS; KDS READY back to POS without reload; concurrent RPC requests return one sale; public table QR to full menu/cart/guest checkout; correct QR business/branch/table and single POS payment; existing customer lookup; canonical Admin price and availability updates reaching POS via realtime; widths 768/1024/1280/1366/1440 without page overflow; offline feedback/reconnect; entitlement revocation of an already-open POS without manual reload; no captured browser runtime errors.

Admin price/availability and entitlement changes were made through the canonical staging database fixture, not by operating the Admin/Super Admin forms. The data-to-POS connection is verified; those forms were not retested in this POS-only task.

### SQL and isolated coverage

SQL assertions cover tax, cash/change, canonical delivery fees and distance limit, pickup/dine-in mapping, authorized promotion, unauthorized discount/refund, foreign business/branch/table denial, inactive business, disabled entitlement, configured manual-card tender, invalid tender, insufficient cash, stale-price rejection, replay payload mismatch, actor-scoped replay, QR payment replay, reversed-sale replay rejection, delivered-order inventory consumption exactly once, branch-scoped customer lookup, and actual authenticated-role RLS reads.

Isolated UI checks additionally cover search/clear, category selection, required modifiers, modifier editing, rapid quantity, removal, mode-context clearing, delivery validation, hold failure recovery, restored scoped cart, uncertain-response replay of the exact request, stale-price review, receipt focus trap, Escape/focus restoration, reduced motion and initial skeleton presence.

## Performance: NOT PASS

Latest real public Chrome run, CPU profiler active, no network/CPU throttling:

| Measurement | Actual |
| --- | --- |
| Product-ready boot | 5,463 ms |
| TTFB | 1,005 ms |
| DOMContentLoaded | 5,023 ms |
| LCP | 5,828 ms |
| CLS, maximum session window | 0.0655894 |
| Long tasks | 77, 92, 86, 72, 50, 61 ms |
| Maximum Event Timing duration | 704 ms |

Maximum Event Timing duration is a lab diagnostic, **not a field INP claim**. Total layout-shift sum was 0.1514147; that sum is not CLS. CLS uses the largest session window. No Lighthouse score or field percentile is claimed.

The earlier first-interaction audio-device initialization produced a roughly 1.55-second long task. The cached asynchronous HTMLAudioElement replacement removed that blocking Web Audio startup. Longest task in the final run was 92 ms. This does not establish that all interactions meet 200 ms.

Function relocation was verified, but the latest cold/public boot remains too slow. Further server bootstrap/network/render breakdown is required before declaring the premium performance gate passed. Do not weaken access validation or cache tenant authorization to hide this delay.

Runtime error log scan of the final deployment, last 15 minutes: no error records returned. Captured browser runtime exceptions: zero. Realtime system errors before the deliberate offline check: zero. Complete HTTP failure-count instrumentation was not included, so a universal zero-network-errors claim is not made.

## Changes delivered

- Canonical server-authoritative transactions, scoped register/tender/branch access and idempotency protections.
- Fast cart, product configuration, fulfilment modes, local recovery, hold/resume, payment review and persisted receipts.
- Preserved initial skeletons; localized mutation states and retained valid data.
- Realtime channel reattachment and missing publication membership fixed.
- Incoming table bills no longer automatically shift the catalog; explicit accessible disclosure.
- Receipt dialog focus trap/search-shortcut isolation and next-order focus recovery.
- Notification audio no longer starts blocking Web Audio on the first cashier interaction.
- POS-only account-menu shrinking/ellipsis fixes laptop overflow; no blanket page-overflow hiding added.
- POS function colocated with the staging database through `apps/admin/vercel.json`.

Changed paths across this POS continuation: `apps/admin/app/(dashboard)/pos/{loading.tsx,page.tsx,pos.css}`, `apps/admin/components/{pos-shift-start.tsx,pos-skeleton.tsx,pos-terminal.tsx,waiter-pos-queue.tsx}`, `apps/admin/lib/{pos-state.ts,order-notification-sound.ts}`, `apps/admin/scripts/{pos-database-checks.sql,test-pos-database.mjs,test-pos-experience.mjs,test-pos-notification-sound.mjs,test-pos-staging.mjs,test-pos-table-queue.mjs}`, `apps/admin/vercel.json`, `docs/pos-guide.md`, this report, and the three migrations below.

Staging migrations already applied in the preceding implementation: `202609280008_web_pos_transaction_safety.sql`, `202609280009_web_pos_reversed_sale_replay.sql`, `202609280010_web_pos_realtime_publication.sql`. No new migration in the final verification continuation.

Runtime commits: `48df028`, `3e88c19`, `8f16eab`, `ff3ae5e`, `9a4c54d`, `a665b8b`, `7b46288`. The first custom-file region attempt did not affect function placement; canonical `apps/admin/vercel.json` discovery in `7b46288` did. Existing ignored root Vercel link restored to the customer staging project after each upload.

Verification/deployment skills guided real browser-to-database checks and deployment inspection rather than treating a successful build as acceptance. Figma foundation/motion context, shadcn accessibility guidance and Context7 Motion documentation were inspected earlier in this continuation; no new animation/UI library was installed.

## Remaining acceptance and technical gaps

1. Performance gate remains failed: measured LCP 5.828 s and maximum lab event duration 704 ms. Regional colocation alone did not meet the target.
2. All 66 requested cases have not been independently exercised in the public browser. Some security, tender, fulfilment and inventory checks are SQL/isolated coverage. In particular, physical touch devices, full screen-reader acceptance, live cashier-only login, delivered-stock reversal/refund behavior and configured external-provider failure/success were not end-to-end accepted.
3. Browser print invocation and persisted receipt contents are tested; actual printer output, hardware chime audibility and external card-terminal settlement require real equipment/operator acceptance. No online gateway or hardware printer support is invented.
4. Existing Admin dependency audit reports two high-severity packages, `nodemailer` and transitive `brace-expansion`; dependency remediation was not included in this POS-only change. This is not a clean platform-wide security audit.
5. Offline cart recovery is not an offline order/payment queue. An unconfirmed payment must be retried with the same stored reference in the same tab.

Disposable staging businesses, orders, invoices, ledger fixtures and fixture auth users created by each browser run were removed by its `finally` cleanup. Final read-only audit returned **0 remaining `qa-web-pos-%` businesses and 0 fixture auth users**. Transactional SQL fixtures were rolled back. No real email or external payment was sent. Existing restaurants were not deleted.
