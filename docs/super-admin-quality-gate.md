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

- New commit deployment and public HTTPS acceptance not yet run at this checkpoint.
- Real owner Google interaction not exercised by password-based fixture sessions.
- Figma design file/node link not supplied; no design parity claim.
- Bell is an honest attention-center link, not a read/unread notification inbox.
- Independent Restaurant 360 tab streaming, package editing, full module action coverage,
  and retention of form/dialog values on existing redirect-based backend errors remain incomplete.
- Platform branding currently verified in Super Admin shell/login/metadata only, not Restaurant
  Admin/POS/desktop/public marketing site. Restaurant logos remain untouched.
- Server logs include aborted response-stream warnings during rapid navigation. Browser regression
  had no console/page errors; public runtime logs still require review before a final PASS.
