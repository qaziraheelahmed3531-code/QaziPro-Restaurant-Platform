# Super Admin quality gate — 2026-09-26

Baseline: `32e80b6`, safety tag `super-admin-quality-baseline-20260926`.
Scope: staging only; existing canonical applications, business_id, RBAC and RLS.
The working-tree dependency edits predate this task and are excluded from its commit.

## Audit map (before implementation)

| Area | Evidence / gap | Planned verification |
| --- | --- | --- |
| Design | Existing Geist, dark sidebar, amber focus, 8/12/18px radii; no Figma URL found in repo | Preserve code tokens; Figma source requested |
| Shell/search | Modal lacks focus trap; search just redirects text to directory; mobile has no inert background | Native dialog; bounded permission-scoped search; keyboard and responsive tests |
| Status | Substring matching marks INACTIVE/UNVERIFIED as success | Exact semantic status tests |
| Mutations | Most server-action forms have no pending/double-click feedback; inline entitlement mutation can succeed before audit fails | Shared form controls; atomic entitlement RPC |
| Settings/branding | Settings dynamic route returns empty records; no canonical platform branding source found | Singleton branding config; owner-only audited upload; shell/login/icon propagation |
| Errors/loading | Only onboarding has loading.tsx; no root error/not-found boundary | Safe retry and geometry-matched skeletons |
| Directory/360 | Paginated directory; 14 parallel 360 queries; large anchor sections rather than independent tabs; raw IDs in heading | Remove prominent IDs; retain canonical behavior; progressive panels remain audit item |
| Onboarding | Six steps; explicit validation, persistent values, idempotency key already present | Preserve and rerun provisioning acceptance; no synthetic email |
| Branches/access | Existing CRUD/RPC scopes; unsafe one-click deactivation UI | Confirmation and pending states; staging fixtures only |
| Packages/apps/domains | Existing pages/actions, package dependency check, canonical domain RPC | Regression and primary actions |
| Health/deployments | Evidence registry, manually recorded status; no live provider worker | Do not claim automatic monitoring |
| Notifications | Bell currently links to health; no platform read/unread model | Explicit attention navigation; notification completion still required |
| Support/tasks/leads/audit | Canonical models and pages exist | Authenticated navigation/action sweep required |

## Tool inventory

Repository/Git/PowerShell, Playwright MCP, Figma MCP, Vercel MCP, official web docs available.
Supabase CLI is available through existing local tooling; no Supabase MCP discovered.
Vercel MCP team discovery returned no teams (CLI scope must be verified separately).

## References

[Next.js loading](https://nextjs.org/docs/app/api-reference/file-conventions/loading),
[Playwright best practices](https://playwright.dev/docs/best-practices),
[WAI modal dialogs](https://www.w3.org/WAI/ARIA/apg/patterns/dialog-modal/).

## Acceptance

Not yet passed. Code/build success does not establish public acceptance. Untested modules,
real Google login, external provider delivery and the full 58-item matrix must not be reported as PASS.

### Verified checkpoint — 2026-09-27

- Super Admin unit tests: 63 passed; typecheck, lint and optimized build passed.
- Local production-build browser against staging database: 50 quality assertions passed
  (17 routes, grouped search and error responses, five viewport sizes, focus/inert behavior,
  branding upload/double submit/shell/login/favicon/restore, unauthorized access, session/logout).
- Existing onboarding browser regression updated for canonical invitation revoke/reissue and
  new confirmation dialogs: 94 assertions passed, 16 routes. Provisioning issued one request;
  synthetic invitation delivery stayed suppressed; branches, entitlement and lifecycle/archive passed.
- Staging authorization suite: 13 assertions passed across two restaurants/four branches.
- Atomic mutation API checks passed: idempotent replay, changed replay rejection, stale version
  rejection, valid update, mandatory branding version. Supabase database lint: no errors.
- Conflict SQLSTATE corrected to `PT409`: `40001` triggered PostgREST retry/timeouts, not a usable
  business conflict. See [Supabase guidance](https://supabase.com/docs/guides/troubleshooting/high-cpu-and-infinite-transaction-retries-when-using-custom-error-codes-in-rpc-functions-77326b).
- Targeted known-secret scan of 54 changed/new files: no matches. Dependency audit:
  no high/critical vulnerabilities; 14 moderate findings in existing mobile/Expo dependency chain.
- Existing Vercel project `qazi-pro-restaurant-platform-super-admin` verified with staging
  APP_ENVIRONMENT and staging Supabase ref. Its Vercel target is named production, but app/data
  environment is staging. No production database, DNS, storefront domain or app-store action.
- Local Super Admin has no Geoapify key; browser regression reused the existing verified staging
  Restaurant Admin key in process memory only. No env files overwritten; temporary read-only
  Vercel env inspection file removed after verification.

### Remaining acceptance / product work

- Commit `1c7f3c8` deployed READY; public HTTPS quality acceptance passed 50 assertions.
- Real owner Google interaction not exercised by password-based fixture sessions.
- Figma design file/node link not supplied; no design parity claim.
- Full module mutation coverage, including all domain/app/support/leads actions, is not yet established.
- Platform branding currently verified in Super Admin shell/login/metadata only, not Restaurant
  Admin/POS/desktop/public marketing site. Restaurant logos remain untouched.
- Server logs include aborted response-stream warnings during rapid navigation. Browser regression
  had no console/page errors; public runtime logs still require review before a final PASS.

### Continuation — notification, form and workspace closure

- Real incidents/failed deployments now feed a permission-scoped notification dialog, with
  per-staff RLS read receipts. Canonical event sources are not duplicated. Local authenticated
  browser verifies rendering, persistence, two-staff isolation, nonstaff denial and resolved removal.
- Expected server-action errors return safe curated inline messages to enhanced forms.
  Values and confirmation dialogs survive business/network failures; double submit is locked.
  Local browser verifies duplicate package rejection, preserved values, missing-record confirmation,
  cancel focus restoration and network-failure recovery.
- Restaurant 360 has eight independently selected server-rendered sections with localized streaming
  fallback, current-section navigation and canonical scoped queries. Overview now runs three data
  queries instead of fourteen (auth queries excluded); irrelevant panels are not loaded.
  Search destinations use the corresponding section query rather than obsolete fragment links.
- Service changes have visible, human-readable success feedback. Invitation resend refuses an
  in-flight claim and uses compare-and-swap before resetting a delivery state.
- Local onboarding regression: 100 assertions / 16 routes PASS, including section navigation,
  invitation in-flight protection, one-request double submit, branches and lifecycle transitions.
  All synthetic invitation deliveries remain suppressed.
- Commercial package editing preserves current subscription prices and capability defaults.
  The audited RPC requires version matching; stale updates return HTTP 409.
- Current unit gate: 82 tests / 10 files PASS. Typecheck, lint, optimized build and staging
  database lint PASS. Notification and package-edit migrations applied only to verified staging.
- Commit `c841289dbae26c56a1e353753071ea499f0000e6` deployed READY in the existing staging
  project (`dpl_7EgBXsywvzVNZqnqHirEVWbCp56U`).
- Public HTTPS: 50 quality assertions PASS; notification RLS/browser suite PASS;
  commercial package edit/audit/stale-version rejection and form-error retention suite PASS.
- Additional real public browser mutations PASS: task create/status, support ticket creation,
  mobile app identity with honest configuration status, pending hostname edit, domain deactivation,
  incident evidence, deployment evidence, audit persistence. Fixtures removed; no external email.
- Public onboarding rerun exposed a pre-hydration interaction race. Form controls now wait for
  hydration, and a server-generated retry key replaces separate server/client random generation.
  Expected provisioning errors now preserve uncontrolled field values and the same idempotency key.
  The updated regression tests server-rendered disabled state, package withdrawal/retry and values.
- A subsequent test setup hit a transient staging PostgREST gateway error before application checks.
  Auth health and database read checks recovered to HTTP 200; that failed run is not counted as PASS.
- Retry instrumentation found another concrete issue: React reused the last Continue button as a
  submit button during the same click. It could provision before explicit review confirmation.
  Distinct keys and default-action cancellation now prevent that unintended submission.
- Updated local production-build onboarding acceptance: **104 assertions / 16 routes PASS**.
  Includes zero provisioning requests on review entry, preserved rejected-input values/retry key,
  exactly one retry request on double submit, canonical persistence, suppressed QA invitations,
  invitation concurrency guard, branch changes and lifecycle/archive transitions.
- Final continuation unit tests: 82 PASS; typecheck, lint and optimized build PASS. Public HTTPS
  rerun of this final hydration/review/retry patch remains pending its Git-integrated deployment.

### Public acceptance — application commit `6ac916b`

- Existing Super Admin deployment `dpl_GUupzcnja5qs7TDcL3Bt1yu9MRWh` reached READY and
  `https://superadmin.qazipro.com` points to it. Exact source:
  `6ac916b121d3c748e01cfe2a724aad21071458c0`.
- Public onboarding acceptance: 104 assertions / 16 routes PASS, including explicit review before
  submission, a rejected-package retry with retained values, one-request double submit, invitation
  suppression, branch changes, lifecycle/archive, session expiry and nonstaff denial.
- Public quality acceptance: 50 assertions PASS. Search errors 400/401/403/409/500 and aborted
  transport, 360/390/768/1366/1920 layouts, focus/inert behavior, branding upload/restore,
  session restore/logout, entitlement replay and stale-write rejection passed.
- Public notification/read-receipt isolation suite PASS; package edit/audit/conflict and
  business/network form-error retention suite PASS; eight module scenarios PASS (tasks,
  support, app identity, pending domain editing/deactivation, incidents, deployments and audit).
- Error-level Vercel log query for this deployment over the last 15 minutes returned no records.
  This is a bounded sample, not a claim that production monitoring is configured.
- All acceptance fixtures were isolated and cleaned by their scripts. Branding restored with a
  version check. No external QA email, production data, DNS or app-store mutation.
- Mobile acceptance was tightened to wait for the actual Restaurant 360 heading before measuring
  overflow or taking its screenshot (not the streaming skeleton). Public rerun: 104/104 PASS;
  the loaded 390px layout was visually inspected. Current-run QA browser business count: zero.

### Final gate limitation

**SUPER ADMIN FINAL QUALITY GATE: FAIL (full acceptance is incomplete).** The scoped browser
and code checks above pass; they do not prove the entire requested matrix.

Still required before a full PASS:

- Authorized owner's real Google login and real-inbox invitation acceptance. Automated tests use
  controlled password sessions and suppressed synthetic recipients; no real delivery claim.
- Figma source/node for design-system parity (connection inspected, no design context supplied).
- Remaining full-matrix acceptance, including lead mutations, domain primary switching and the
  complete operator permission matrix. These are not covered merely by successful route loads.
- QaziPro-controlled email-template branding audit. Other application branding consumers are
  a later phase; Restaurant Admin/POS/desktop/marketing propagation is not claimed here.
- Final manual visual/accessibility review. Keyboard/dialog/viewport checks are not a WCAG audit.

The default QaziPro design language was retained; shared states and interaction safety were
improved instead of replacing the product identity. No production deployment is authorized.
