# Italian Pizza Platform Architecture

> Historical foundation document. For the current multi-application QaziPro baseline, deployment boundaries and Super Admin/public-site additions, use `docs/platform-architecture.md`. The security principles and data flows below remain relevant, but its application inventory is no longer complete.

## System shape

The platform is a small monorepo with two deployable Next.js applications and one runtime-neutral package boundary:

- `apps/customer`: public storefront, Supabase customer auth, Geoapify routes, review integrations and trusted order route handlers.
- `apps/admin`: separately deployable, staff-only management application.
- `apps/backend`: documents and compiles the backend boundary. A redundant always-on API server is intentionally not introduced.
- `packages/shared`: browser-neutral contracts and commerce helpers.
- `supabase`: versioned PostgreSQL/RLS/storage migrations plus development seed data.

Supabase PostgreSQL is the single persistent source of truth. Supabase Auth identifies both customers and staff. A `staff_memberships` row, checked on the server and by RLS, is required for admin access.

## Data flows

### Storefront read

1. The customer root layout calls the server-only storefront loader.
2. The loader uses the publishable Supabase client and public RLS policies.
3. Business, branding, site settings, branch operations, hours, delivery rules/areas, categories, products, modifiers, deals, banners and social links are normalized into a `StorefrontSnapshot`.
4. The snapshot is passed once through `AppProvider`; the existing UI consumes it without duplicating reads.
5. If the rollout schema is absent or temporarily unavailable, the loader returns the pre-existing static fallback, keeping the storefront usable.

### Order write

1. The browser submits only IDs, quantities, customer input and coordinates to `POST /api/orders`.
2. The server determines the authenticated customer from the Supabase cookie session.
3. Geoapify calculates route distance server-side from the admin-configured origin (environment coordinates remain a migration fallback).
4. The service-role-only PostgreSQL function validates branch/hours/area/availability/modifiers, loads current prices, computes discounts and delivery, and inserts the order graph atomically.
5. Authenticated orders are linked to `auth.users.id`. Guests receive a random tracking token; only its SHA-256 hash is stored.
6. The returned order number is used by customer tracking and immediately appears in the admin orders list.

### Admin write

1. Admin login uses Supabase Google OAuth or email secure links.
2. The dashboard layout resolves an active staff membership server-side.
3. RLS independently restricts every table mutation by business and role.
4. Storage uploads use a business-ID folder prefix and are protected by MIME/size checks plus path-scoped storage policies.
5. Database triggers create audit records for operational mutations and status history for order changes.
6. Admin writes call a protected revalidation bridge. The customer loader also uses no-store reads, so data does not remain stale indefinitely.

## Trust boundaries

- Browser totals are estimates only.
- `SUPABASE_SERVICE_ROLE_KEY`, Geoapify and Google credentials are server-only.
- Normal Supabase users are customers unless an authorized membership exists.
- Admin route redirects are usability controls; RLS is the security boundary.
- Online payment is structurally represented but cannot be selected or processed.

## Availability strategy

Customer reads degrade to the existing static storefront. Writes never silently become fake production orders: database storefronts require the trusted order command; the local order path remains only for the explicit pre-migration fallback mode. Admin errors are presented as recoverable empty/error states.
