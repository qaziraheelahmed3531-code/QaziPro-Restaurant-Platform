# QaziPro Restaurant Platform

Multi-tenant restaurant technology monorepo. Supabase is the source of truth and `business_id` is the canonical tenant key.

## Applications

- `apps/customer` — restaurant storefront and `/api/v1`
- `apps/admin` — restaurant operations, Web POS, KDS, waiter/rider and reporting
- `apps/super-admin` — QaziPro platform control center
- `apps/desktop-pos` — offline-capable Windows POS
- `apps/mobile` — Android/iOS customer application
- `apps/backend` — backend boundary and push worker
- `packages/shared` — shared contracts/business logic
- `qazipro-website` — standalone public marketing and lead site
- `supabase` — versioned database/RLS/storage migrations and tests

## Verification

```powershell
npm run lint
npm run build
npm run test:push
npm run test:mobile
npm run test:super-admin
```

Staging-only acceptance uses the authenticated Supabase CLI and refuses an unexpected project:

```powershell
powershell -NoProfile -ExecutionPolicy Bypass -File scripts/run-admin-client-portal-staging.ps1 -Suite admin
powershell -NoProfile -ExecutionPolicy Bypass -File scripts/run-admin-client-portal-staging.ps1 -Suite super-admin
powershell -NoProfile -ExecutionPolicy Bypass -File scripts/run-full-staging-acceptance.ps1
```

The full public suite intentionally fails when a deployed staging application is behind the current API contract. It creates disposable QA tenants and removes them in `finally`.

## Safety

Copy each app's `.env.example` to an ignored local file and use Development/Staging only. Never commit service-role keys, OAuth/payment/SMTP secrets, signing credentials, `.next*`, `dist`, `release` or `node_modules`. Do not apply migrations, deploy, publish apps or change DNS in Production without the approved runbook and rollback evidence.

See [platform architecture](docs/platform-architecture.md), [deployment](docs/deployment.md), [production runbook](docs/production-runbook.md) and [tenant security](docs/tenant-branch-security.md).
