# QaziPro Super Admin

Internal platform control center for QaziPro company staff. It is intentionally separate from the Restaurant Admin portal. The canonical hierarchy remains `business_id -> branches -> restaurant users/clients`; no second tenant identifier was introduced.

## Architecture

- App: `apps/super-admin` (Next.js App Router, port 3002 locally).
- Authentication: Supabase Auth with the separate `qazipro-platform-auth` cookie namespace.
- Authorization: `platform_staff` plus role permissions and direct allow/deny overrides. Every privileged server action checks a granular platform permission. Database RPCs repeat permission checks.
- Privileged credentials: `SUPABASE_SERVICE_ROLE_KEY` is imported only by `server-only` code. It must never use a `NEXT_PUBLIC_` prefix.
- Data: existing `businesses`, `branches`, orders and POS device records are reused. Platform-specific commercial, onboarding, support, release and audit records are additive.
- Scale: directory queries are server-side and paginated; operational histories are bounded and indexed. Health without real signals is `UNKNOWN`, never fake healthy.
- Platform order/GMV metrics come from an authorized database aggregate over the full UTC day, not a truncated client-side order page.
- Overview counts websites as ready only when customer-domain verification, DNS and HTTPS are all healthy. Android/iOS and POS counts are backed by enabled app records and active registered devices. Incident and deployment-failure counts use exact database counts rather than the six-row attention preview.
- The protected application shell is forced dynamic so authorization is never frozen into build-time HTML when runtime environment configuration differs.
- A directory permission does not grant raw customer-order row access. The dashboard receives only aggregate totals.

## Local setup

1. Apply `supabase/migrations/202609210001_super_admin_foundation.sql` to an isolated local or staging project only. The linked staging project already has the Step 9 migrations.
2. On this Windows workspace, authenticate the Supabase CLI and verify `supabase/.temp/project-ref` is `jzisqjvroxodvmqxzsob`. Run `npm run dev:super-admin` from the repository root, then open `http://localhost:3002`. The launcher verifies that exact staging project, obtains its public/server keys for the child process, and does not print or commit them. Stop any older server on port 3002 before restarting. For a different isolated project, use `npm run dev:super-admin:plain` with a private `apps/super-admin/.env.local` based on `.env.example`; never point it at Production.
3. Enable the Google provider in **staging** Supabase Auth, provide its Google OAuth client ID/secret in the provider settings, and allow `http://localhost:3002/auth/callback` (plus the exact approved staging HTTPS callback). The initial owner must sign in with a verified Google identity matching `qaziraheelahmed3531@gmail.com`. An email/password or OTP identity with the same address cannot bootstrap Platform Owner. Existing invited staff still require a matching active `platform_staff` membership; revoked staff cannot reactivate by signing in.

### Staging Google sign-in activation

The linked staging project is `jzisqjvroxodvmqxzsob`. Its Auth settings now report Google enabled and signup enabled, but the configured Google OAuth Client ID is malformed; Google returns HTTP 401 `invalid_client`. The named owner email is **not** yet an Auth user in this staging project; first successful Google sign-in can create it and the verified-identity bootstrap will then grant Platform Owner. An account with that email in another Supabase project does not count.

1. In Google Auth Platform, create a **Web application** OAuth client for staging. Add `http://localhost:3002` as an authorized JavaScript origin and `https://jzisqjvroxodvmqxzsob.supabase.co/auth/v1/callback` as the authorized redirect URI. If the OAuth audience is in testing mode, add the owner's Google account as a test user.
2. In the **staging project only**, open Supabase **Authentication → Providers → Google** and replace the invalid Client ID with the exact Google Web application OAuth Client ID and its matching secret. A valid Google Client ID has the form `digits-token.apps.googleusercontent.com`; do not enter an email, API key, placeholder, or secret in the Client ID field. Never put the secret into this repository, a `NEXT_PUBLIC_` value, or chat. The existing Google Business Reviews OAuth client is different and does not authorize the staging Supabase callback; do not reuse it without a deliberate scope/redirect review.
3. In Supabase **Authentication → URL Configuration**, allow `http://localhost:3002/auth/callback`. Add an HTTPS staging callback only after that exact domain is configured. Leave production settings unchanged.
4. Restart `npm run dev:super-admin`, open `/login`, and sign in interactively with the named Google account. Verify the dashboard opens, the `platform_staff` membership has the `PLATFORM_OWNER` role, and a different Google account is denied. Do not mark this complete until those checks run.

Production Supabase and live `qazipro.com` are not part of this setup. Configure the future host `admin.qazipro.com` only during an approved production release.

## Roles and permissions

System roles include Platform Owner, Super Admin, Operations Manager, Onboarding Manager, Support Engineer, Developer, Deployment Manager, Billing/Finance, Sales and Auditor. Authorization uses granular permissions such as `restaurants.create`, `branches.manage`, `billing.edit`, `apps.manage`, `support.access`, `team.manage` and `audit.view`; role names alone never grant access.

Direct permission records override role grants. A deny wins over a role grant. Revoking a `platform_staff` record blocks the next authorized request immediately. Restaurant staff records never qualify for platform access.
Only a Platform Owner can grant/deny a staff member's custom permission. An allowlisted but revoked owner is not reactivated by another sign-in.

## Restaurant onboarding

The guided wizard creates one inactive business, one or more branches, branding, package/subscription, entitlements, mobile app registry, domain checks, owner invitation and audit record in one transaction. Its request key makes retries idempotent. Domain, SSL, push and deployment readiness begin as pending/unknown until a real integration verifies them.

Lifecycle transitions are restricted: Lead -> Agreement Pending -> Onboarding -> Configuration -> Staging -> Client Review -> Ready -> Active. Controlled backwards/offboarding/suspension paths exist; invalid stage skipping is rejected in the database. Activation enables the existing business. Suspension retains historical data.

### How to onboard a new restaurant from zero

1. Create at least one service package under **Packages**.
2. Open **Onboarding -> New restaurant**.
3. Enter business, owner, country/currency/timezone and stable public restaurant key.
4. Select services. Add one or more branches; keep online ordering disabled until location/rules are verified.
5. Select package and enter approved commercial values.
6. Enter branding, requested domains and purchased Android/iOS identifiers.
7. Review and provision. Retrying the same submission cannot duplicate the tenant.
8. Open the agreement workspace, paste legal-approved terms, issue the secure seven-day signing link and send it to the invited owner.
9. Review and approve the signed agreement. Never ask for the owner's password.
10. Complete domain/DNS/SSL, auth callback, app credentials, branch hours/location/tax/delivery and environment verification.
11. Progress only through legal lifecycle gates. Activate after the Ready checklist is complete.

## Agreements

Agreement legal text is configurable and versioned; no legal wording is generated by the platform. Share tokens are high-entropy, stored only as SHA-256 hashes, expire after seven days and are invalidated on signing. Signing is rate-limited through the existing distributed rate-limit RPC. QaziPro approval and both signing actions are audited. PDF generation is intentionally not included until an approved legal document template exists.

## Entitlements and billing

Packages define commercial defaults and capability defaults. Restaurant entitlements record explicit package, override, trial or add-on sources with optional limits/effective dates. Subscription states are Trial, Active, Past Due, Grace Period, Suspended and Cancelled. Billing status never deletes restaurant data. Existing runtime clients must adopt capability checks incrementally before an entitlement can be treated as hard enforcement outside this portal.

## Operations workflows

- **Restaurant 360:** identity, lifecycle, branches, entitlements, domains, apps, POS devices, support, deployments and audit history.
- **Support:** ticket/incident registry scoped to a business and optional branch. No password sharing or unsafe remote control is implemented.
- **Health:** incident signals and integration readiness. Provider probes/Sentry/Vercel adapters must write real results; missing inputs remain Unknown.
- **Apps:** records identifiers, versions, credential status, push status and store URLs, never private signing keys.
- **Branches:** creates locations through an authorization-enforced RPC; deactivation also disables online ordering and preserves history.
- **Domains/deployments:** records verification and release evidence. Provider API credentials remain external secrets.
- **Billing/entitlements:** updates subscription states and charges without deleting restaurant data; capability overrides are explicit, dated and audited.
- **Tasks:** assigns cross-team work, due dates, priority and controlled workflow states to active QaziPro staff.
- **Integrations:** stores only provider readiness and expiry metadata, never the credential itself.
- Manual forms cannot mark integrations `CONNECTED` or apps `PUBLISHED`; those states require future trusted provider/build evidence.
- **Team:** secure invite, least-privilege system role, MFA-ready flag and immediate portal revocation.
- **Audit:** append-only history for ordinary staff; actor, target, tenant, reason, request ID and safe before/after metadata.

## Security

- Set `PLATFORM_ALLOWED_ORIGINS` to the exact local/staging/production hosts used by Next Server Actions.
- Keep the service role only in server environment variables. Run artifact/source secret scans before release.
- Require Supabase MFA policy before production; `mfa_required` records readiness but does not replace IdP enforcement.
- Configure Supabase redirect allowlists for `/auth/callback` on each approved environment.
- Keep the owner bootstrap allowlist small and remove bootstrap dependence after the permanent owner is established.
- Public agreement links convey no platform session or tenant authority; all stored access uses a token hash.
- Do not enable provider controls until monitoring/deployment credentials and operational approval exist.

## Daily QaziPro workflow

1. Review Overview attention counts and System Health unknown/critical signals.
2. Work assigned onboarding/support/deployment tasks.
3. Open Restaurant 360 before any client-impacting change.
4. Record a reason for lifecycle, access, commercial or release changes.
5. Verify audit history and unresolved blockers before activation or suspension.

## Verification

- Unit: `npm run test:super-admin`
- Lint/typecheck/build: `npm --workspace apps/super-admin run lint`, `typecheck`, `build`
- Database/RLS (isolated database only): apply migrations then run `psql ... -f supabase/tests/super-admin-foundation.sql`
- Staging acceptance: set `ALLOW_STAGING_ACCEPTANCE=1`, `APP_ENVIRONMENT=staging`, `STAGING_SUPABASE_PROJECT_REF`, URL/public/server-only Supabase keys in the process environment, then run `npm run staging:super-admin`. The script creates two temporary restaurants and removes its QA records after verification. Never point it at Production.
- Verified staging wrapper: `./scripts/run-admin-client-portal-staging.ps1 -Suite super-admin` runs the disposable API/RBAC acceptance against the exact linked staging ref. With a local staging-configured Super Admin on port 3102, `-Suite super-admin-browser` checks 17 authenticated routes, command palette, mobile layout and non-staff denial using disposable QA identities. The wrapper never prints keys.
- Existing platform regression: run the existing multi-tenant, branch, checkout, mobile, POS and build suites.

## External integrations still required

Real DNS/SSL checks, Vercel/GitHub deployment adapters, Sentry ingestion, invoice/payment provider, SMTP deliverability, MFA enforcement policy, Slack/email alerts and production secret management require accounts/credentials and explicit production authorization. The portal records their status but does not fake connectivity.

## Current operational limits

- The four Step 9 migrations have been applied to the linked **QaziPro Restaurant Staging** project only. Production was not migrated.
- The local staging launcher supplies environment variables safely. The login page checks both provider status and OAuth Client ID shape, and now keeps Google sign-in disabled with a clear message for the malformed client rather than sending the user to Google's HTTP 401 page. The actual named Platform Owner Google login has **not** been executed. Disposable QA browser sessions do not prove Google OAuth.
- Agreement legal wording and any signed-PDF template require QaziPro legal approval. The secure web-signing record is implemented; PDF export is not.
- External provider probes, push/build signing checks, invoice collection and notifications remain adapters, not live integrations.
- Restaurant runtime entitlements are recorded centrally, but existing website/POS/mobile clients do not yet enforce every package capability. Do not use package state alone as a security boundary.
- The SQL regression file runs in CI's isolated Supabase database. It was also executed on staging inside a transaction with `ROLLBACK`; QA users/restaurants were confirmed absent afterward. Local Docker was unavailable. API staging acceptance covers idempotent provisioning, two-restaurant separation, RBAC, lifecycle and audit.
