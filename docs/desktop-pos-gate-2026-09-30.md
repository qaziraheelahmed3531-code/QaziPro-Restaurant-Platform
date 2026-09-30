QAZIPRO DESKTOP POS FINAL GATE:
PARTIAL — software improved and tested; not all master acceptance gates passed.

DESKTOP FRAMEWORK:
Electron 44.3.0, React, Dexie/IndexedDB.

SUPPORTED OS:
Windows x64 verified.

BUILD ARTIFACTS:
apps/desktop-pos/release-staging/QaziPRO POS Desktop Setup 0.1.0.exe
apps/desktop-pos/release-staging/QaziPRO POS Desktop 0.1.0.exe
Unsigned staging exports; packaged runtime tested, installer upgrade not tested.

OFFLINE CORE

DURABLE LOCAL DATABASE:
PASS — transactional IndexedDB, persistence/migration tests.

LOCAL MENU SNAPSHOT:
PASS

OFFLINE CASH ORDER:
PASS — actual blocked transport, one local sale; separate live reconnect tests.

OFFLINE CART PERSISTENCE:
PASS — actual process-tree kill and fresh offline launch.

OFFLINE TABLE ORDER:
FAIL — canonical table identity/occupancy integration incomplete.

CRASH RECOVERY:
FAIL — cart and committed cash kill/restart pass; uncertain server-ack matrix incomplete.

OUTBOX:
PASS

IDEMPOTENCY:
PASS — tested local concurrency and staging order/cash replay.

RECONNECT SYNC:
PASS — live disconnected cash sale arrived once; shift revision synchronized.

MISSED CLOUD ORDER BACKFILL:
FAIL — three real cloud orders backfilled once; late-commit/delete policy incomplete.

CONFLICT RESOLUTION:
FAIL — pricing, revision and kitchen uncertainty safeguards pass; remaining policies incomplete.

INVENTORY RECONCILIATION:
PASS — staging database movement/idempotency checks; not a full restaurant shift walkthrough.

ONLINE CORE

REALTIME:
FAIL — live KDS status propagation passes; full Desktop event matrix incomplete.

KDS:
PASS — tested canonical online counter order visibility and PREPARING/READY feedback.

CUSTOMER WEBSITE ORDERS:
FAIL — Desktop API backfill passes; full customer-to-Desktop UI matrix pending.

WEB POS SYNC:
FAIL — full cross-device walkthrough pending.

RESTAURANT ADMIN SYNC:
PASS — price/config refresh verified.

SUPER ADMIN SYNC:
FAIL — access removal preserves data; revoked-backlog reconciliation policy incomplete.

PAYMENT

CASH ONLINE:
PASS — staging database checks.

CASH OFFLINE:
PASS

CARD ONLINE:
NOT CONFIGURED

CARD OFFLINE:
INTENTIONALLY DISABLED

DUPLICATE PAYMENT PROTECTION:
PASS — cash replay/concurrent submission tests.

PAYMENT RECONCILIATION:
FAIL — cash path verified; provider reconciliation unverified, provider not configured.

OPERATIONS

TABLE SERVICE:
FAIL

HOLD / RESUME:
PASS — durable local storage tests.

SPLIT BILL:
FAIL — not verified.

SHIFT MANAGEMENT:
FAIL — independent shift/cash reconciliation fixed and tested; full operator UI acceptance remains.

CASH DRAWER:
NOT SUPPORTED — driver not configured.

CLOCK IN/OUT:
FAIL — not verified.

VOID:
FAIL — complete Desktop workflow unverified.

REFUND:
REQUIRES ONLINE

HARDWARE

RECEIPT PRINTER:
PENDING HARDWARE — software adapter tested.

KITCHEN PRINTER:
PENDING HARDWARE — local branch destination, durable jobs, diagnostics and explicit COPY implemented/tested.

KDS LOCAL NETWORK:
NOT IMPLEMENTED FOR VALID REASON — no existing secure LAN architecture.

PAYMENT TERMINAL:
NOT CONFIGURED

HARDWARE DIAGNOSTICS:
PASS — software discovery, missing-printer failure, job persistence/recovery; paper acceptance pending.

SECURITY

SECURE TOKEN STORAGE:
PASS — Windows protected storage and first-profile key durability tested.

LOCAL DATA PROTECTION:
FAIL — operational IndexedDB encryption incomplete; credential protection is separate.

IPC/NATIVE BRIDGE:
PASS — sender validation, allowlists, bounded ticket payloads, native rejection tests.

TENANT ISOLATION:
PASS — staging negative tests.

BRANCH ISOLATION:
PASS — staging negative tests and local queue/status scoping.

RBAC:
FAIL — shift server permissions tested; full offline-role matrix incomplete.

UX

QAZIPRO PRE-LOGIN BRAND:
PASS

RESTAURANT POST-LOGIN BRAND:
PASS

RUNTIME WINDOW BRANDING:
PASS

FLUID MOTION:
FAIL — full acceptance unverified.

MICRO-ANIMATIONS:
FAIL — full acceptance unverified.

FLUID MICRO-INTERACTIONS:
FAIL — full acceptance unverified.

BUTTER-SMOOTH PERFORMANCE:
FAIL — Desktop add-to-paint 20.9ms, cached menu 189ms; 151ms long task remains.
Web max recorded event improved 264ms to 120ms; longest task 69ms, ready 4211ms.
No thresholds relaxed. Full gate remains incomplete.

KINETIC NUMERIC FEEDBACK:
FAIL — unverified.

UNNECESSARY SHIMMER REMOVED:
PASS — initial loading retained.

KEYBOARD:
FAIL — quantity/search/fullscreen tested; complete workflow acceptance remains.

TOUCH:
FAIL — 44px quantity targets verified; full touch workflow unverified.

DEVICE / RELEASE

DEVICE PROVISIONING:
PASS

DEVICE MANAGEMENT:
FAIL — full management acceptance remains.

AUTO UPDATE:
FAIL — safe adapter tests pass; real signed upgrade/provider acceptance pending.

CODE SIGNING:
NOT CONFIGURED

UPDATE PRESERVES UNSYNCED DATA:
FAIL — v2 to v6 migration passes; installer upgrade remains unverified.

DIAGNOSTICS:
PASS — redacted order, shift and kitchen counts.

APP DISTRIBUTION

DESKTOP DOWNLOAD:
FAIL — local artifacts ready; published channel unavailable.

RELEASE MANIFEST:
PASS — local artifact checksums generated, no invented public URL.

MOBILE/TABLET DOWNLOAD FOUNDATION:
FAIL

WAITER ROLE ACCESS:
PARTIAL

RIDER ROLE ACCESS:
PARTIAL

IOS DISTRIBUTION:
NOT CONFIGURED

ANDROID DISTRIBUTION:
NOT CONFIGURED

TESTING

OFFLINE TESTS:
29 reliability, 16 shift, 6 status reconciliation, 8 kitchen queue, 11 native adapter checks passed / 0 failed.

MULTI-DEVICE TESTS:
Staging two-device database checks passed; complete simultaneous UI matrix pending.

PLAYWRIGHT/NATIVE E2E:
15 packaged-native groups passed; 10 live Desktop staging checks passed; Web 32 isolated and 24 live passed.
An ambiguous native locator failed initially and was corrected before the final full passing run.

CHROME DEVTOOLS:
Web grid rerenders eliminated for cart updates; interaction outlier reduced. Long tasks remain.

COLD START:
3798ms to login, packaged Windows run.

WARM START:
Offline fresh process restarts 3978ms / 1039ms; distinct from cached reload.

MENU INTERACTIVE:
189ms cached menu reload.

ADD ITEM LATENCY:
20.9ms click-to-paint, one measured packaged fixture interaction.

MEMORY LONG RUN:
Not completed; short-run heap 10MB, not a memory-leak acceptance result.

CONSOLE ERRORS:
None in final passing native/Web runs.

SYNC ERRORS:
Tested failures recover/preserve data; revoked-backlog policy remains incomplete.

FILES CHANGED:
See git commit 27a4b0e and subsequent kitchen/keyboard commit, plus continuation checkpoint.

LOCAL DB MIGRATIONS:
v6 printJobs; v2 to v6 preservation test passed.

SERVER MIGRATIONS:
20260930170000 desktop shift reconciliation — staging only.

COMMITS:
27a4b0e; kitchen/keyboard changes in the commit containing this report.

STAGING BUILD:
READY — Windows artifacts rebuilt 2026-09-30 18:52:47 UTC.
Web staging READY dpl_GjuTWRynpwR4eq1SS9McB1nj9DU4 at https://admin.staging.qazipro.com.

MANUAL HARDWARE TESTS REQUIRED:
Receipt/kitchen paper output, drawer driver and configured terminal acceptance.

REAL BLOCKERS:
Remaining software: canonical tables/order modes, operational DB encryption, revoked backlog,
complete offline RBAC/conflicts, installer upgrade, release/distribution foundation, performance
and long-session acceptance. Next/nodemailer/brace-expansion dependency advisories need remediation.
Physical/provider acceptance does not explain or excuse these independent software gaps.

NEXT MANUAL CHECK:
Staging installation and kitchen diagnostic paper output; continue independent software gaps above.
