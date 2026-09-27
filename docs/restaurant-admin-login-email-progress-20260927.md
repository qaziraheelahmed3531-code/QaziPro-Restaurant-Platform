# Restaurant Admin — login and email safety continuation

This is a **partial scope delivery, not final A-to-Z acceptance**. It extends the verified loading/table/menu work at `3a6dd7d`. QR ordering, verified reviews, browser push and public auth/delivery acceptance are not complete. No production changes, live database writes, real emails or push notifications were performed.

## SCOPE COMPLETED

- Password-first controls removed from the main Admin login. Canonical Google + eight-digit OTP calls and server authorization handoff retained. Password recovery routes remain intact.
- Responsive split login with six layered operation illustrations, 2.2-second carousel, manual controls, pause, focus/hover/hidden-tab handling and live reduced-motion preference changes.
- Wall-clock resend cooldown, same-frame submission guards, loading labels and visible auth errors.
- Customer broadcast safety: verified restaurant domain/lifecycle resolution, escaped branded email links, no transport for wholly synthetic batches, checked delivery persistence and truthful error/progress states.
- Existing campaign/outbox extended with idempotent creation and non-retryable uncertain SMTP attempts. Migration tested on isolated local PostgreSQL only.

## REMAINING GAPS FOUND BEFORE IMPLEMENTATION

Login retained a primary password path and a simple five-second story rotation. Email creation had no request key; client state alone did not protect against same-frame clicks. SMTP links used a global Customer URL. Database failures were ignored when saving delivery results/totals. Stale SENDING records were reclaimed after ten minutes, risking duplicate messages after an ambiguous SMTP outcome.

## ROOT CAUSES

Auth UI mixed two primary login models. Carousel preference state did not update when reduced-motion changed. Broadcast creation, provider submission and result persistence lacked distinct reliability boundaries. Provider success was conflated with durable database success, and interrupted delivery was assumed safe to retry.

## CANONICAL TABLES / MODELS / APIs USED

- Supabase `signInWithOAuth`, `signInWithOtp`, `verifyOtp`; `/auth/callback`, `/auth/complete`; existing membership/branch/entitlement authorization unchanged.
- `business_domains` and `resolve_storefront_business` for the verified primary storefront origin; no default tenant or global URL fallback.
- `customer_broadcasts`, `customer_broadcast_deliveries`, `storefront_customer_memberships`, `business_branding`, `deals`, `audit_logs`.
- Existing `create_customer_broadcast` recipient-selection/audit RPC reused through an idempotent overload. Existing `claim_customer_broadcast_batch` updated, not replaced with another queue.
- Existing Nodemailer transport and shared `isSyntheticQaEmail` suppression reused.

## LOGIN PAGE REDESIGN STATUS

Implemented and isolated browser-tested at 360/768/1440px. Login stays first on compact viewports. Desktop pseudo-3D panel is an illustration, explicitly labeled a workflow preview, not fabricated live restaurant statistics. Screenshots are under `docs/qa/restaurant-admin-login/`; provider artwork is a local placeholder and the harness uses Arial, so these are component evidence, not public deployment captures.

## GOOGLE LOGIN STATUS

Mocked provider initiation, duplicate click prevention, same-origin callback and failure recovery PASS. Actual Google consent, authorized owner/staff access, unauthorized account denial, session restore and logout still require public staging acceptance. OAuth provider configuration was not changed.

## 8-DIGIT EMAIL CODE LOGIN STATUS

Mocked send/verify/resend, incomplete/expired code, missing session, cooldown and server handoff PASS. Real SMTP delivery and Supabase eight-digit configuration were not exercised. No external email was sent by automated tests.

## QR TABLE FLOW STATUS

NOT COMPLETE. Existing safe table CRUD preserved. Customer table QR generation, full-menu entry, tenant/branch/table validation and cart/order propagation still require implementation and E2E acceptance.

## REVIEW FLOW STATUS

NOT COMPLETE. Existing Google/review widgets are not a verified-order review capture system. Eligibility, persistence, anti-abuse and Admin visibility remain pending.

## PUSH NOTIFICATION STATUS

NOT COMPLETE. Existing notifications/mobile device capability must not be represented as a verified browser push lifecycle. Browser subscription, permission UI, send integration and click/deep-link acceptance remain pending.

## EMAIL FLOW STATUS

Locally verified safety improvements; real delivery NOT ACCEPTED. Creation retry keys are scoped by restaurant and actor; changed payload reuse is rejected. Eight concurrent requests produced one campaign, audience and creation audit event. Confirmed creation clears the composer and retries operate on that campaign. Empty/in-flight batches stop client polling rather than falsely reporting completion.

SMTP has no universal exactly-once guarantee. Uncertain provider errors and interrupted SENDING records now require operator reconciliation, not automatic resend. Only the known pre-send `Email provider is not configured.` outcome remains automatically retryable, with the existing attempt ceiling. Do not manually reset ambiguous delivery rows until provider logs are checked.

The creation key is retained for an unchanged draft in the mounted component; closing/reloading the page is not durable draft persistence. The legacy four-argument RPC remains for backwards compatibility; current HTTP clients require a key. Separate intentionally created campaigns can still send the same content. Marketing consent/unsubscribe eligibility needs its own review before broad campaign use.

## UI/UX MOTION & MICRO-ANIMATION STATUS

New login transitions are lightweight opacity/transform effects, user-pausable, and respect reduced motion. Existing structural shimmer and reliable pending/mutation states retained and regression-tested. This is not an all-route frame-rate/performance certification.

## RESPONSIVENESS STATUS

Login and previous loading/table fixtures passed mobile/tablet/desktop checks without document overflow. All-module authenticated responsive acceptance remains pending.

## SECURITY / RLS STATUS

Existing auth/RLS policies were not weakened. API denial, tenant filters, cross-tenant domain rejection and zero-row mutation failures are covered by isolated tests. SQL test uses an explicit permission shim in a disposable cluster: it is NOT full deployed RLS evidence. Full staging owner/staff/branch/tenant tests remain necessary.

## FILES CHANGED

- `apps/admin/components/login-form.tsx`, `login-stories.tsx`, `customer-broadcast-manager.tsx`
- `apps/admin/app/login-experience.css`, `layout.tsx`, `api/customer-broadcasts/route.ts`
- `apps/admin/lib/use-reduced-motion.ts`, `customer-origin.ts`, `email/customer-broadcast.ts`
- `apps/admin/package.json`
- `apps/admin/scripts/test-login-experience.mjs`, `test-customer-broadcast-safety.mjs`, `test-broadcast-manager.mjs`, `test-broadcast-database.mjs`
- `supabase/migrations/202609270006_customer_broadcast_safe_retries.sql`
- This report and login QA screenshots.

Unrelated Super Admin dependency/lockfile edits remain excluded.

## MIGRATIONS / DATA CHANGES

One new migration: nullable request key/unique index on the existing campaign table, idempotent RPC overload and safe claim behavior. Applied only to a fresh isolated local test cluster. No staging/production data was changed. Temporary local clusters were stopped; test logs/data remain in the OS temporary directory.

Deployment prerequisite: verify staging project identity and a backup/restore point, apply this migration to staging only, verify RPC overload/claims, then deploy current Admin source. Do not deploy the new email API before its migration: it deliberately does not fall back to non-idempotent creation.

## TEST RESULTS

| Check | Result | Evidence boundary |
|---|---|---|
| Admin lint | PASS | ESLint |
| Admin typecheck | PASS | `tsc --noEmit` |
| Admin optimized build | PASS | Next build; no deployment |
| `test:loading` | PASS — 10 | Actual components, isolated browser |
| `test:tables` | PASS — 17 | Actual component, mocked DB |
| `test:availability` | PASS — 9 | Actual components, mocked transport |
| `test:login` | PASS — 12 | Actual components, mocked auth |
| `test:email` | PASS — 13 server + 6 browser | Mock DB/provider; no external delivery |
| `test:email:database` | PASS — 8 | Actual PostgreSQL functions/concurrency; minimal test schema/permission shim |
| Public auth/QR/reviews/push/email/full RLS | NOT RUN | Must not infer PASS from local tests |

75 targeted checks. The table test's existing Node module-type warning is non-fatal. Database test requires local PostgreSQL binaries (`QAZIPRO_TEST_PG_BIN` override available), starts only a new loopback cluster and ignores inherited libpq connection variables.

## PUBLIC / STAGING URLS VERIFIED

None for this source revision. Harness origins `http://qazipro.test` and `https://admin.example.test` are intercepted local fixtures, not public services.

## COMMIT SHA

See `git log -1 --oneline -- docs/restaurant-admin-login-email-progress-20260927.md` or the delivery response. Canonical remote was fetched and verified; before this change local main was one commit ahead and zero behind origin/main.

## DEPLOYMENT STATUS

Not deployed or pushed in this continuation. Staging migration/application rollout and auto-deployment target verification are still required. No production, DNS, live qazipro.com or app-store actions.

## NEXT MANUAL TESTS

1. Confirm staging-only target, apply the tested migration, verify deployment routing, then release Admin to staging.
2. With authorized test accounts, verify genuine Google and eight-digit OTP, membership/branch/entitlement denial, restore and logout.
3. Use explicitly consenting real inboxes for two restaurants. Confirm each message links only to its restaurant, shows accurate provider-submission counts and suppresses synthetic recipients.
4. Replay an identical creation key concurrently, interrupt a result-save attempt and confirm ambiguous delivery is not automatically resent; reconcile through provider logs.
5. Implement QR/menu/table context, verified reviews and browser push before full public E2E. Re-run tenant/branch/RLS and responsive acceptance against the actual deployed artifact.
