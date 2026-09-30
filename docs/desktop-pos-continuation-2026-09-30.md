# Desktop POS continuation checkpoint — 2026-09-30

Overall gate: **PARTIAL**, not a release approval. This record separates working
software from missing software and external acceptance. Do not repeat the initial
audit on continuation; address the outstanding list below first.

## Canonical architecture and safety

- `apps/desktop-pos`: Electron 44.3.0, React 19.2.8 / Vite, Dexie 4.2.1 IndexedDB.
- Existing database name retained: `kings-cafe-offline-pos-v1`; transactional schema
  upgrades 2 → 3 (held branch), 4 (staff-scoped drafts/holds), 5 (cloud order cache).
- Native bridges are allowlisted, main-frame/origin checked, context isolated,
  sandboxed; renderer Node access and arbitrary navigation/popups disabled.
- Windows credentials use Electron safeStorage (DPAPI), atomic protected files,
  not plaintext browser storage. Operational IndexedDB is **not encrypted**.
- Offline known-staff authorization expires within 24 hours; expiry/clock rollback
  fails closed. Initial enrollment requires online canonical authorization.
- Only staging Supabase `jzisqjvroxodvmqxzsob` was modified. No production deployment,
  real payment charge, email, hardware job, store publication or updater publication.
- Root Vercel link restored to customer staging. Admin deploy was explicitly scoped
  to existing `qazipro-restaurant-admin-staging` (`prj_TuSSIaWALfAprlq5W9sBd3G3FgBF`).

## Implemented and verified boundaries

- Atomic local sale, device-aware reference, draft/held consumption and rapid-submit
  guard. Durable leased outbox, backoff/jitter, manual attention recovery and stable
  operation identity; late acknowledgement cannot overwrite a newer operation.
- Server validates immutable catalog pricing/tax snapshot. Actual offline cash
  sale retained its collected total after server price/tax changed, then arrived
  once with one payment ledger record on reconnect.
- Permission, branch, entitlement and device checks; revocation locks new actions
  without deleting saved accounting data. **Revoked backlog ingestion policy is
  not complete**: server denial preserves pending data but may require manager action.
- Branch-scoped paginated cloud-order cache with atomic page/cursor persistence.
- Cached startup, branch/staff cart persistence, offline card disabled, online-only
  server-confirmed cash cancellation. Branding changes without window remount.
- Receipt printer discovery/selection, guarded print boundary with no blind retry;
  submitted means OS spooler acknowledgement, never proof of paper output.
- Pinned electron-updater 6.8.10 driver, packaged-publisher Authenticode verification,
  explicit check/download/install, fresh idle-state requirement, install concurrency
  latch and sanitized failure. No signed feed configured or end-to-end update tested.
- F11 fullscreen / Escape exit; safe allowlisted diagnostics export.
- Sanitized cloud errors; structured initial loading preserved; no mutation shimmer.

## Evidence

Commands run from repository root unless stated otherwise:

| Verification | Result and scope |
| --- | --- |
| `node apps/desktop-pos/scripts/test-reliability.mjs` | 29 passed / 0 failed; real Chromium IndexedDB, injected transport, actual v2→v5 migration preserves pending sale/held/device |
| `node --test apps/desktop-pos/scripts/test-secure-store.cjs apps/desktop-pos/scripts/test-printer-adapter.cjs apps/desktop-pos/scripts/test-update-adapter.cjs` | 7 passed / 0 failed; adapter tests, not physical/provider acceptance |
| `node apps/desktop-pos/scripts/test-native.mjs --packaged` | 13 groups passed / 0 failed; actual packaged Windows Electron, isolated temporary profile, actual network blocked, printer boundary intentionally cancelled |
| `node apps/desktop-pos/scripts/test-staging-reconnect.mjs` | 6 passed / 0 failed in preceding continuation; actual Electron + staging, real network disconnection, one cash order/payment, changed price, device deauthorization; fixtures cleaned |
| `node apps/desktop-pos/scripts/test-database.mjs --deployed` | Passed staging rollback checks: two device IDs, immutable tax/price, replay/payment, inventory, refund permissions, branch/device/access denial |
| Staging Supabase security advisors, severity ERROR | No issues found; warning-level/full audit is not claimed |
| Desktop and Admin production-mode compilation | Passed; desktop bundle-size warning and root Astro tsconfig warning remain |
| `node apps/admin/scripts/test-pos-staging.mjs https://admin.staging.qazipro.com` | 24 passed / 0 failed; actual cash, receipt, KDS, QR/customer, realtime, entitlement revocation, branch/cursor negatives; fixture removed |

Latest packaged native run: cold login 3997ms; cached menu 200ms; add-to-paint
26.7ms; measured heap 21.7MB; no last-navigation long tasks or runtime exceptions.
This is a short run, **not** an hours-long memory/stability result. Restart coverage
is renderer reload/database reopen, **not** process kill at every transaction phase.
Display assertions wait for actual 1024/1366/1440/1920 inner width and verify cart
bounds, not merely absence of a document scrollbar. Native input tests use Electron
input events because CDP keyboard dispatch bypasses native accelerator handling.

Latest Web evidence: `test-results/pos/public-evidence.json`, 16:21:55 UTC.
Before root streaming boundary: ready 6204ms, LCP 6464ms, assets discovered ~4874ms.
After: ready 3913ms, LCP 2332ms, assets discovered ~1735ms, CLS 0.0741.
LCP includes initial public loading content: **do not equate it with POS ready**.
Largest observed event duration 264ms; long tasks 140/137/82/56/83/60/67/113ms.
Therefore **Web BUTTER-SMOOTH PERFORMANCE remains FAIL**, despite meaningful boot
improvement. Event duration here is a lab observation, not field INP.

Web staging deployment: `https://qazipro-restaurant-admin-staging-k1pfxm5ph.vercel.app`
(alias `https://admin.staging.qazipro.com`). Root loading boundary only emits public
QaziPRO copy while authenticated parent layout resolves; no authorization caching
or bypass, and existing structured POS skeleton remains.

## Windows staging export

Build: `powershell -NoProfile -ExecutionPolicy Bypass -File apps/desktop-pos/scripts/package-staging.ps1`.
Existing NSIS/portable targets, Windows x64, version 0.1.0. `--publish never`.
Packaged runtime embeds staging URLs/channel; native test mode validates a disposable
temporary profile and skips protocol registration. Production builds do not allow
packaged smoke mode. Executable icon/resources retained while signing disabled.

| Artifact under `apps/desktop-pos/release-staging/` | SHA-256 |
| --- | --- |
| `QaziPRO POS Desktop Setup 0.1.0.exe` | `0e5504632faade39f177b11c717b6af8bdaf4bbda1a2cdce3a120b6675efdf5a` |
| `QaziPRO POS Desktop 0.1.0.exe` | `ce3a6975bed5a1b9b7ac683785fb68d31348b8ea119acffbf1470d2c67d25b03` |

`release-manifest.json` generated with sizes/checksums, null published/download
URLs rather than invented links. Authenticode reports **NotSigned**. Packaged
unpacked executable tested; NSIS install/uninstall wizard and update upgrade path
not tested. Build artifacts and test-result files are ignored generated output.

## Outstanding software — not hardware excuses

1. **Shift reconciliation**: server creates offline shifts CLOSED during first sale
   ingestion; subsequent local close/count changes and empty shifts are not independently
   synchronized. Add canonical authenticated idempotent shift/cash event reconciliation
   with tests; do not replay sales as a substitute. Paid-in/out/drop/attendance incomplete.
2. New desktop orders only implement takeaway/dine-in today. Finish canonical pickup,
   delivery, actual table identity/occupancy and customer flows. Do not claim free-text
   table labels equal canonical table service. Review replacement authorization/ack flow.
3. Kitchen/station printer routing, durable dispatch identity, test print and printer
   widths need completion. Existing receipt adapter alone is not a kitchen-routing PASS.
   No secure LAN KDS architecture exists; cloud queue is not offline LAN connectivity.
4. Operational local data encryption/minimization/retention, staff ownership on outbox,
   logout/late-response races and offline role restrictions require further verification.
5. Backfill timestamp cursor needs late-commit/delete policy and complete missed inbound
   order E2E. Current atomic cursor tests do not prove every concurrent server case.
6. Catalog refresh currently downloads images and re-registers snapshots periodically;
   improve targeted refresh/progressive asset cache without blocking local ordering.
7. Process-kill/crash matrix, internet flapping live tests, old→new installer update with
   pending transactions, hours-long memory/listener/timer stability and high-DPI checks.
8. Real public release/download integration, waiter/rider permission-based download
   foundation, device management acceptance, terminal adapter/provider configuration.
9. Remaining Web event-presentation/long-task outliers. Keep loading states, don't hide
   slow results by changing thresholds, delaying measurement or calling skeleton LCP ready.
10. Deployment install reported two high-severity dependency advisories: inspect before
    release; no unreviewed `npm audit fix` or framework upgrade was performed.

## External acceptance only

Physical receipt/kitchen print and drawer: PENDING HARDWARE after respective software
paths are complete. Terminal acquiring: PENDING PROVIDER / not configured. Signing
certificate/update feed: NOT CONFIGURED. iOS/Android store releases: NOT CONFIGURED.
These do not block independent software implementation above.

## Database / git continuation

Staging migration applied and history recorded:
`supabase/migrations/20260930154151_desktop_pos_snapshot_tax_and_access.sql`.
Re-run its deployed rollback check with `--deployed`; its migration anchors intentionally
fail if reapplied. Do not repair or push production migration history.

Web commits: `5e7ab60`, `cb23423`, `5ea56b7`, `53f1ac5`, `eb94dff`.
Desktop source/tests are captured in the commit containing this checkpoint. Generated
`apps/desktop-pos/tsconfig.app.tsbuildinfo` is deliberately not part of that source commit.

## Continuation verified at 2026-09-30 17:02 UTC

This section supersedes the earlier shift/crash/KDS entries, not the entire gate.
Overall remains PARTIAL; remaining software must not be relabeled PASS.

- Independent local shift revisions now reconcile via `sync_offline_pos_shift`:
  open/empty shifts, paid-in/out/drop, final count, authoritative cash/refunds,
  expected/difference, idempotent movement IDs, audit, branch/device scope and
  manager permission. Closed shift waits for pending sales; late acknowledgements
  cannot swallow newer revisions. Migration `20260930170000` applied/history
  recorded on staging `jzisqjvroxodvmqxzsob` only. Deployed rollback checks pass.
- Process-kill testing found a real first-profile encryption-key durability bug.
  Electron async safeStorage now waits for Windows profile key persistence before
  acknowledging credential provisioning. Actual process-tree kill + offline fresh
  launch verifies cart recovery and committed cash sale without duplicate/revived
  cart. Uncertain server-ack kill and complete flapping matrix still remain.
- Counter orders now receive canonical server/KDS status through branch/business
  scoped reconciliation, realtime and reconnect. Pending local mutations and
  changed revisions are not overwritten. Late branch responses do not reset UI.
- Three real cloud orders inserted while Desktop transport was blocked backfilled
  through authenticated API once. KDS canonical query sees one sale with one line;
  authenticated PREPARING and READY updates reach Desktop through realtime.
  This is not the complete late-commit/delete cursor or customer UI matrix.
- Web product grid memoization/stable functional callbacks eliminate menu renders
  during cart adds/quantity changes. Render-count regression test proves this.
  Next.js and React skill guidance informed these boundaries and callback review.

### Latest verification

29 reliability + 16 shift + 6 status reconciliation + 8 native adapter checks pass.
10 live Desktop staging checks pass; 13 packaged Electron groups pass; 32 isolated
Web browser checks and 24 live Web staging checks pass. TypeScript/build pass.
Disposable staging identities/restaurants and native profiles were removed.
No physical print, provider charge or real customer email was sent.

Web: ready 4211ms, LCP 2536ms, max recorded event 120ms (was 264ms), longest task
69ms (was 140ms), CLS .0741. Full butter-smooth gate still not passed; no threshold
was relaxed. Latest packaged Desktop: login 4032ms, cached menu 197ms, add-to-paint
22.7ms, actual offline process restarts 4145/978ms, short-run heap 10MB, long task
145ms. Cold-login instrumentation now stops at visible login, before F11 checks.
No hours-long memory or full scaling acceptance yet.

Web staging READY: `dpl_GjuTWRynpwR4eq1SS9McB1nj9DU4`,
`https://qazipro-restaurant-admin-staging-4ji47mm2y.vercel.app`, alias
`https://admin.staging.qazipro.com`. Existing admin-staging project only; root
customer-staging Vercel link preserved; no production project deployment.

Latest Windows staging artifacts generated 17:00:04 UTC (unsigned):
- Setup SHA256 `7baf356fa3184fc00735ac1dd5f922f93f6b2065f230b13b13fe3fc190bfbc9b`
- Portable SHA256 `8d113628d21cd9639e11b49f9c17731c4721c673e130b9ec3bad3fb4310181a5`

Additional release risk confirmed by npm audit: Next 16.3.4 critical
GHSA-vcvr-r3jv-pc5j; nodemailer and brace-expansion high advisories. No blind audit
fix performed. Review scoped patch upgrades and regressions before production.
Tables/modes, encrypted operational DB, kitchen routing/diagnostics, revocation
backlog reconciliation, installer upgrade, distribution and full role matrix remain.

## Continuation verified at 2026-09-30 18:53 UTC

Kitchen software and basic cashier keyboard improvements are now implemented:

- One explicitly configured local branch kitchen printer, available without cloud.
  This is not station routing or LAN KDS. The receipt screen provides a separate
  manual kitchen action and warns against duplicating an existing receipt kitchen copy.
- Version 6 adds durable print jobs. Order/revision identity deduplicates rapid taps;
  the database claims a job before native IPC. Interrupted/uncertain attempts are
  never automatically replayed. Operator-confirmed COPY retains the original audit
  and can use a newly selected fallback printer.
- Typed, bounded and escaped 58/80mm preparation documents render in a sandboxed,
  JavaScript-disabled hidden window. Only the trusted main renderer can invoke IPC.
  OS submission is not reported as confirmed physical paper output.
- Hardware settings now include discovery, selected destination, diagnostic ticket,
  recent job states and explicit recovery. Diagnostics export includes only counts,
  not ticket/customer payloads. Pending printing also blocks updater restart.
- Quantity/remove buttons have accessible names; quantity targets are 44px and
  decrement disables at one. Documented `/` search preserves typing in editable
  fields. Cash management uses the existing settings scroll container.

### Current test/build evidence

29 reliability, 16 shift reconciliation, 6 KDS status reconciliation, 8 kitchen
queue and 11 native adapter checks pass. Packaged native groups: **15 passed,
0 failed**, including real disconnected process-kill recovery, keyboard controls,
missing OS printer failure without duplicate jobs, and 1024/1366/1440/1920 layouts.
The first native attempt exposed an ambiguous test locator after accessibility
labels were added; the exact accessible locator was corrected and the full run passed.
No real paper was printed. Tests use disposable profiles; no production data touched.

Latest packaged measurements, after packaging finished: cold login 3798ms, cached
menu 189ms, add-to-paint 20.9ms, disconnected process restarts 3978/1039ms, short-run
heap 10MB. Long tasks 74/151/88ms remain; **full performance gate is not PASS**.
Renderer errors: none. This is not an hours-long memory or physical touch test.

Windows staging artifacts rebuilt at 18:52:47 UTC, unsigned, publish disabled:
- Setup SHA256 `ebea147470d20484c19de6f35b238995ec9e2de4983235d05e70300d6d23b36c`
- Portable SHA256 `a76b2db3f444f8c0960b1bc49c523c20626888a464c9a4884cdd0dc5dfbfd278`

Version 2 to version 6 migration preserves pending sales, held orders and device
identity in regression tests. A real old-installer to new-installer upgrade is still
unverified. No new server migration or Web deployment in this kitchen batch.

Remaining independent software: canonical table/order modes, encrypted operational
DB, complete revoked-backlog policy, late-commit/delete backfill, full offline RBAC,
installer-upgrade preservation, distribution links/role foundation, complete
performance/long-session acceptance and dependency advisory remediation. Hardware
acceptance is separate and is not the reason these remain incomplete.
