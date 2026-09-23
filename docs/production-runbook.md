# Production release runbook

## Pre-release gates

- Approved commit/tag, clean working tree, private remote and reviewed CI.
- Production Supabase project identity independently verified; no staging/local process points to it.
- Backup/point-in-time recovery evidence and named rollback owner.
- Migration dry-run, DB lint, secret scan, builds/tests and critical E2E evidence attached.
- Google OAuth, Geoapify, email, monitoring and any enabled payment/push providers configured and tested in non-production first.
- Old `qazipro.com` deployment retained and current DNS/TTL recorded.

## Release execution

1. Announce the change window and freeze writes that conflict with schema changes.
2. Take/verify database backup.
3. Apply migrations once, in repository order; never edit an applied migration.
4. Run RLS/tenant/branch smoke tests with disposable production-safe accounts.
5. Deploy backend/worker if enabled, then Customer, Restaurant Admin and Super Admin.
6. Verify health, login, catalog, controlled COD order, POS/KDS propagation and tracking.
7. Deploy public website to preview; verify leads reach Super Admin without exposing the service role.
8. Obtain explicit domain-cutover approval.
9. Remove `qazipro.com`/`www` only from the old Vercel project, add them to the new project, apply the exact Vercel-provided DNS values, wait for SSL and verify canonical redirect.
10. Keep the old project deployable until the observation window closes.

## Production smoke test

Use a clearly named controlled restaurant/test branch and avoid harmful real transactions. Check public homepage/contact, Platform Owner login, Restaurant Admin login, restaurant domain/menu, cart, COD checkout, Admin/POS/KDS appearance, legal status progression, customer tracking and audit/request IDs. Confirm no console 5xx/CORS/hydration errors and no secret appears in browser/mobile assets or logs.

## Stop/rollback conditions

Stop or roll back for tenant leakage, authorization bypass, wrong totals, duplicate orders, unavailable checkout/login, migration integrity failure, elevated 5xx rate, broken custom domains or missing audit trail. Frontends roll back to the previous provider deployment. Worker rolls back to its previous image. Database rollback uses the documented inverse migration only when proven safe; otherwise restore the backup into a controlled recovery project and perform a reviewed recovery. Never run destructive ad-hoc SQL under incident pressure.

## DNS plan

Do not pre-invent record values. Vercel/provider-issued values are authoritative.

- `qazipro.com`: provider-required apex A/ALIAS to the new public-site project after approval.
- `www.qazipro.com`: CNAME/provider alias to the public-site project; redirect to canonical apex.
- `admin.qazipro.com`: provider-issued CNAME/A for Super Admin.
- `api.qazipro.com`: no record unless a dedicated HTTP backend is actually deployed.
- Restaurant `restaurant.com`: provider-issued apex/verification records to the shared Customer project.
- Restaurant `admin.restaurant.com`: provider-issued CNAME/A to Restaurant Admin if this routing option is approved.

For every hostname: attach in provider first, publish DNS-only records, verify ownership/SSL, add exact Supabase redirect URLs, test, then optionally enable proxy/CDN settings known to be compatible.

## Supabase production checklist

Create/identify the production project, record ref/region/owner, enable backups, apply migrations, run `db lint`, validate indexes/constraints/RLS/storage policies/functions/triggers, configure Site URL and exact redirect allowlist, Google provider, SMTP, CAPTCHA/rate limits where used, secrets/webhooks and monitoring. The Supabase Google callback is always `https://<production-project-ref>.supabase.co/auth/v1/callback`; browser app callbacks are separately allowlisted. Test the named owner plus an unauthorized Google account and a restaurant account.
