# Deployment architecture and environment matrix

Production deployment is not authorized by this document. It defines the verified targets and order; it does not contain secret values.

## Web projects

| Component | Repository/root | Provider | Build command | Intended domain |
| --- | --- | --- | --- | --- |
| QaziPro public website | Current monorepo, root `qazipro-website` until an approved repo split | Vercel / Next.js | `npm run build` | `qazipro.com`, `www.qazipro.com` |
| Super Admin | Platform monorepo, root `apps/super-admin` | Vercel / Next.js | `npm run build` | `admin.qazipro.com` |
| Restaurant Customer | Platform monorepo, root `apps/customer` | Vercel / Next.js | `npm run build` | Shared project with verified restaurant custom domains/subdomains |
| Restaurant Admin | Platform monorepo, root `apps/admin` | Vercel / Next.js | `npm run build` | Shared project with approved admin hostnames |
| Backend/push worker | Platform monorepo, root `apps/backend` | Worker-capable Node host only when enabled | `npm run build` | No `api.qazipro.com` unless an actual dedicated HTTP service is introduced |

Vercel output is framework-managed `.next`; do not set a custom output directory. Staging and production must be separate environments/projects or have strictly separated variables and databases.

## Environment variables

Values come from the relevant provider dashboard, never Git. `NEXT_PUBLIC_` and `EXPO_PUBLIC_` values are client-visible; every other credential listed as server must stay server-only.

### Restaurant Admin (`apps/admin`)

Required: `APP_ENVIRONMENT`, `NEXT_PUBLIC_SUPABASE_URL`, `NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY`, `CUSTOMER_APP_URL`, `ADMIN_APP_URL`. Server-required for privileged workflows: `SUPABASE_SERVICE_ROLE_KEY`, `REVALIDATION_SECRET`. Feature/provider variables: `GEOAPIFY_API_KEY`, `NEXT_PUBLIC_GEOAPIFY_MAPS_KEY`, Google Maps/Places keys, `PAYMENT_MODE`, Safepay/PayFast secrets, SMTP variables, `DEMO_LEADS_ENABLED`. Staging-only safety: `STAGING_SUPABASE_PROJECT_REF`.

### Restaurant Customer (`apps/customer`)

Required: `APP_ENVIRONMENT`, `NEXT_PUBLIC_SUPABASE_URL`, `NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY`, `QAZIPRO_PLATFORM_DOMAIN`, `ENABLE_DEMO_STOREFRONT=false`. Server-required for writes/revalidation: `SUPABASE_SERVICE_ROLE_KEY`, `REVALIDATION_SECRET`. Delivery/reviews/payments/mail use the exact optional names in `apps/customer/.env.example`. `STOREFRONT_BUSINESS_SLUG` is local-development only and must be unset in shared staging/production.

### Super Admin (`apps/super-admin`)

Required: `APP_ENVIRONMENT`, `NEXT_PUBLIC_APP_ENVIRONMENT`, `NEXT_PUBLIC_SUPABASE_URL`, `NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY`, server-only `SUPABASE_SERVICE_ROLE_KEY`, `QAZIPRO_PLATFORM_OWNER_EMAILS`, `PLATFORM_ALLOWED_ORIGINS`, `RESTAURANT_ADMIN_URL`, `PLATFORM_PUBLIC_URL`. Owner allowlisting does not replace `platform_staff` authorization.

### Public website (`qazipro-website`)

Required: `APP_ENVIRONMENT`, `NEXT_PUBLIC_SITE_URL`, `NEXT_PUBLIC_CLIENT_PORTAL_URL`, `NEXT_PUBLIC_SUPER_ADMIN_URL`, `NEXT_PUBLIC_DEMO_PORTAL_URL`. Lead storage requires server-only `SUPABASE_URL`, `SUPABASE_SERVICE_ROLE_KEY`, matching `SUPABASE_PROJECT_REF` and `PUBLIC_LEADS_ENABLED=1`; staging may use the legacy `STAGING_SUPABASE_PROJECT_REF` fallback. Production never accepts the staging-only fallback. Notification webhook and Plausible variables are optional.

### Mobile (`apps/mobile`)

Client-visible runtime values: `EXPO_PUBLIC_APP_ENV`, `EXPO_PUBLIC_API_BASE_URL`, Supabase URL/publishable key, restaurant public key, link domain, push switch and brand colors. Build-time identity/assets use the `MOBILE_*` names in `.env.example`. Never add a service-role key, payment secret or OAuth client secret.

### Desktop POS

Release packaging must receive non-local HTTPS Customer/Admin URLs, production/staging Supabase URL and publishable key through the approved build environment. The packaging guard rejects localhost or incomplete release configuration. Signing credentials belong in the CI signing store, not source.

## Safe dependency order

1. Freeze the reviewed commit and release tag; push without rewriting history.
2. Back up production Supabase and record restore evidence.
3. Dry-run then apply reviewed migrations in numeric order; lint DB and rerun RLS tests.
4. Configure Auth providers, redirect allowlists, SMTP, storage and rate limits.
5. Configure backend/push worker only if provider credentials exist; verify health.
6. Deploy Customer preview/staging and verify `/api/v1`, domain resolution and checkout.
7. Deploy Restaurant Admin preview/staging; verify auth, POS, KDS and live sync.
8. Deploy Super Admin preview/staging; verify real Google OAuth and authorized/unauthorized accounts.
9. Attach approved restaurant staging/custom domains and verify SSL/callbacks.
10. Deploy QaziPro public website to a new preview project and run form/SEO/visual QA.
11. After explicit approval only, cut `qazipro.com` from the old project to the new one.
12. Sign/test Desktop POS, then Android internal testing and iOS TestFlight. Store production publishing requires separate approval.

## Repository plan

The current root is already one Git repository and has no configured remote. It contains the platform apps and currently tracks `qazipro-website`. Safest immediate setup is one private repository named `QaziPro-Restaurant-Platform` with Vercel root directories above. A later marketing-site split should preserve history with a reviewed subtree/filter procedure; do not copy/delete blindly during release freeze.

Never commit `.env*` secrets, `.next*`, `dist`, `release`, `node_modules`, signing files, service-account files, CLI temp credentials or generated QA artifacts.
