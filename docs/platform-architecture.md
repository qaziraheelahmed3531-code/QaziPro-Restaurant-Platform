# QaziPro platform architecture

Verified baseline: 23 September 2026. The canonical tenant key is `business_id`; `branch_id` is an operational scope inside a tenant. Supabase PostgreSQL/Auth/Storage is the authoritative data plane. No application owns a second menu, price, customer or order database.

## Applications

| Application | Purpose | Authentication / authorization | Data and API boundary | Deployment target |
| --- | --- | --- | --- | --- |
| `qazipro-website` | Public company, services, portfolio and lead capture | Public; lead writes are validated/rate-limited server-side | Same-origin `/api/leads` writes to platform lead records using a server-only key | Separate Vercel project; `qazipro.com` only after approved cutover |
| `apps/super-admin` | QaziPro platform operations | Supabase Google OAuth plus active `platform_staff` membership and granular platform permissions | Server Components/Actions and server-only Supabase admin client | Vercel; intended `admin.qazipro.com` |
| `apps/admin` | Restaurant operations, Web POS, KDS, waiter, rider, inventory, reports and settings | Supabase Auth plus active `staff_memberships`; RLS and RPC permission checks | Next route handlers/actions plus Supabase | Vercel; shared application, restaurant-specific hostname/routing |
| `apps/customer` | Multi-tenant storefront and frozen `/api/v1` mobile API | Public tenant resolution; Supabase customer sessions for private data | Server-authoritative order/API handlers and public/customer RLS | Vercel; one shared project serving verified custom domains |
| `apps/desktop-pos` | Offline-capable Windows counter POS | Staff auth, permission and device pairing | Downloads signed tenant/branch catalog snapshots; idempotent sync to platform RPCs | Signed Windows installer/portable package |
| `apps/mobile` | White-label Android/iOS customer app | Customer Supabase session; public restaurant key, never raw tenant selection | Consumes `apps/customer` `/api/v1` | EAS/Play internal testing and TestFlight before store release |
| `apps/backend` | Runtime-neutral backend boundary and push worker | Server-only provider credentials | Supabase is the main backend; Next route handlers own session-aware HTTP commands | Worker-capable host only when push delivery is enabled; no redundant API server |
| `packages/shared` | Shared contracts and pure commerce helpers | N/A | Imported by applications; no persistence | Bundled with consumers |
| `supabase` | PostgreSQL, Auth, Storage, RLS, RPCs, triggers and migrations | Supabase JWT/RLS; service role is server-only | Single source of truth | Dedicated staging and production projects |

## Authoritative flows

- Catalog: Restaurant Admin -> Supabase tables/RPCs -> Customer Website, `/api/v1`, Web POS, Desktop POS and KDS.
- Order: Website, mobile, Web POS, Desktop POS or waiter -> server/RPC validation -> `orders` graph -> Admin, KDS, tracking and reports.
- Entitlement: Super Admin -> package/subscription/entitlement tables -> runtime checks. A UI-hidden item is not an authorization boundary.
- Tenant: verified hostname or public restaurant key -> `business_id`; selected `branch_id` is checked against that business. Unknown and unverified domains fail closed.
- Audit: privileged database/server actions -> append-only operational or platform audit records with actor, scope, reason and request ID where available.

## Runtime boundaries

The browser and mobile app may receive publishable Supabase keys. They must never receive a service-role key, payment secret, SMTP password, OAuth secret or push-provider credential. Checkout totals, eligibility, branch, price, tax, discount, modifiers and delivery are recalculated server-side. `apps/backend` intentionally does not duplicate the Customer/Admin route-handler API.

## Current deployment state

Customer and Restaurant Admin have public staging Vercel deployments. The public QaziPro website has a protected Vercel preview. Super Admin is verified locally against staging but production OAuth is not configured. The deployed Customer staging build is behind the current source mobile OpenAPI contract and must be redeployed before final acceptance. Production deployment and live DNS are not authorized.
