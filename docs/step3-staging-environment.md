# Step 3 staging environment

## Environment matrix

| Concern | Local | Staging | Production |
| --- | --- | --- | --- |
| Supabase project | Local CLI stack or explicit development project | Dedicated `QaziPro Restaurant Staging` project | Existing production project; never used by staging tests |
| `APP_ENVIRONMENT` | `local` | `staging` | `production` |
| `NEXT_PUBLIC_SUPABASE_URL` | Local URL | Staging project URL | Production project URL |
| `NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY` | Local publishable key | Staging publishable key | Production publishable key |
| `SUPABASE_SERVICE_ROLE_KEY` | Local service key, server only | Staging service key, server only | Production service key, server only |
| `QAZIPRO_PLATFORM_DOMAIN` | Optional local test suffix | `staging.qazipro.com` after DNS/deploy | Final QaziPro platform domain |
| `STOREFRONT_BUSINESS_SLUG` | Allowed only for explicit local development | Unset | Unset |
| `ENABLE_DEMO_STOREFRONT` | Optional `true` for deliberate demo work | `false` | `false` |
| `GEOAPIFY_API_KEY` | Development key | Staging key with quota restrictions | Production key with quota restrictions |
| `SENTRY_DSN` / `NEXT_PUBLIC_SENTRY_DSN` | Optional | Staging DSN | Production DSN |
| `SENTRY_ENVIRONMENT` | `local` | `staging` | `production` |

Secrets belong in the hosting provider/Supabase secret store. They must never be committed or exposed to browser bundles. `SUPABASE_SERVICE_ROLE_KEY` is server-only.

Desktop release packaging also requires explicit non-local HTTPS `CUSTOMER_APP_URL` and `ADMIN_APP_URL`, plus the staging/production Supabase URL and publishable key. `npm run package:desktop` now fails closed if a release would embed localhost or incomplete connection settings.

## Existing real staging project

- Project name: `QaziPro Restaurant Staging`
- Project ref: `jzisqjvroxodvmqxzsob`
- Region: `ap-south-1`
- All repository migrations and seed were applied on 20 September 2026.
- Persistent fixtures are visibly named `STAGING QA` and use `@staging.qazipro.invalid` emails.
- Fixture provisioning and removal are explicit: `npm run staging:fixtures` and `npm run staging:cleanup`.
- Both commands require `STAGING_ENVIRONMENT=staging`; neither stores credentials.

## Required deployment and DNS action

1. Create separate staging deployments for Customer and Admin from the private repository.
2. Configure only the staging variables listed above using the staging Supabase keys.
3. Add `restaurant-a.staging.qazipro.com` and `restaurant-b.staging.qazipro.com` to the Customer staging deployment.
4. Add the DNS records requested by the hosting provider.
5. In Supabase Authentication → URL Configuration, set the staging Customer/Admin URLs and their auth callback URLs. Do not add localhost or staging URLs to production unless explicitly required.
6. Configure a staging Sentry project and add its DSNs if external issue capture is desired. Structured server logs and request IDs work without Sentry.

## Operational acceptance

Run the Customer production build against staging, then execute `npm run staging:acceptance`. The suite uses real HTTP requests, two businesses, four branches, authenticated RLS users, authoritative checkout and adversarial cross-tenant writes. It creates only clearly marked QA orders.

Run `npm run staging:pos` for reversible offline sync, price-tamper, replacement/refund, legal stage progression, branch reporting and print-setting checks. Run `npm run staging:responsive` while the staging-configured Customer (`3100`), Admin (`3101`) and Desktop POS Vite (`5174`) servers are running. All three commands require `STAGING_ENVIRONMENT=staging` and explicit staging credentials.

For incident correlation, every versioned health/order response includes `x-request-id`, and failures emit structured JSON containing only safe operational context. Customer payloads, auth headers, cookies, tokens and secrets are never logged.
