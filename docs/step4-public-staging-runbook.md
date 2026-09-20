# Step 4 public staging runbook

Status: public Vercel staging is deployed and the public fallback domains are verified. The required `staging.qazipro.com` domains remain blocked only by DNS records outside this repository. Production Supabase was not changed.

## Deployed projects

| Project | Root directory | Public fallback |
| --- | --- | --- |
| `qazipro-restaurant-customer-staging` | `apps/customer` | `https://qazipro-restaurant-customer-staging.vercel.app` |
| `qazipro-restaurant-admin-staging` | `apps/admin` | `https://qazipro-restaurant-admin-staging.vercel.app` |

The customer project also has verified QA aliases for public tenant tests:

- `https://qazipro-restaurant-a-staging.vercel.app`
- `https://qazipro-restaurant-b-staging.vercel.app`
- `https://qazipro-unknown-staging.vercel.app`
- `https://qazipro-unverified-staging.vercel.app`

Both projects use the staging Supabase project `jzisqjvroxodvmqxzsob`. Demo storefront fallback is disabled. No production Supabase credential belongs in these projects.

## Required DNS action

Create these DNS-only records in the current `qazipro.com` DNS provider. Leave the Cloudflare proxy off until Vercel has issued and verified HTTPS certificates.

| TYPE | HOST | VALUE |
| --- | --- | --- |
| A | `restaurant-a.staging` | `76.76.21.21` |
| A | `restaurant-b.staging` | `76.76.21.21` |
| A | `admin.staging` | `76.76.21.21` |

The domains are already attached to their correct Vercel projects. After DNS propagation, verify all three with `vercel domains inspect <domain>`.

## Supabase Auth configuration

The following configuration is already applied to staging project `jzisqjvroxodvmqxzsob`:

- Site URL: `https://restaurant-a.staging.qazipro.com`
- Redirect: `https://restaurant-a.staging.qazipro.com/**`
- Redirect: `https://restaurant-b.staging.qazipro.com/**`
- Redirect: `https://admin.staging.qazipro.com/**`

Do not add these URLs to production Supabase. Login/reset callbacks on the exact custom domains must be browser-tested after DNS resolves.

## Environment boundary

Customer staging requires `APP_ENVIRONMENT=staging`, the staging Supabase URL and keys, `QAZIPRO_PLATFORM_DOMAIN=staging.qazipro.com`, `ENABLE_DEMO_STOREFRONT=false`, a shared staging-only `REVALIDATION_SECRET`, and a staging-restricted `GEOAPIFY_API_KEY`.

Admin staging requires the same staging Supabase project, `CUSTOMER_APP_URL=https://restaurant-a.staging.qazipro.com`, `ADMIN_APP_URL=https://admin.staging.qazipro.com`, and the same staging-only revalidation secret.

The Supabase service-role key is server-only. It must never use a `NEXT_PUBLIC_` name or be included in Desktop POS.

## Public acceptance

The public Vercel-alias run completed with 22 PASS and 1 SKIP. Tenant/domain resolution, forged-branch rejection, branch selection, catalog overrides, variants, modifiers, coupons, tax, pickup checkout, idempotency, guest/auth orders, POS visibility, storage/RLS isolation, reports/payments/register isolation, COD, distributed rate limiting, and concurrent catalog access passed over HTTPS. Delivery routing was skipped because public staging has no Geoapify key.

After DNS and Geoapify are configured, rerun with exact domains and without the skip flag:

```text
PUBLIC_STAGING=true
STAGING_ENVIRONMENT=staging
STAGING_CUSTOMER_URL=https://restaurant-a.staging.qazipro.com
STAGING_CUSTOMER_B_URL=https://restaurant-b.staging.qazipro.com
STAGING_UNKNOWN_URL=https://qazipro-unknown-staging.vercel.app
STAGING_UNVERIFIED_URL=https://qazipro-unverified-staging.vercel.app
STAGING_ADMIN_URL=https://admin.staging.qazipro.com
npm run staging:acceptance
npm run staging:pos
```

The acceptance commands also require staging-only Supabase credentials and an ephemeral `STAGING_QA_PASSWORD` in the current shell. Never save those values in Git.

## Remaining external gates

- Add a staging-restricted Geoapify key to the customer Vercel Production environment, redeploy, and rerun public acceptance without `STAGING_SKIP_EXTERNAL_LOCATION`.
- Connect a private Git remote and run the existing hosted CI workflow.
- Connect staging Sentry projects/DSNs and verify one controlled error in Customer, Admin, and API.
- Install the generated Desktop POS package on a clean Windows machine and test a real receipt printer.
- Add sandbox payment-provider credentials only when online payments are required; COD is already verified.
