# Tenant and branch security

## Identity model

- `business_id` is the only tenant identifier.
- `branch_id` belongs to exactly one business and scopes operational records.
- Public requests resolve a verified hostname or restaurant public key; raw client-supplied `business_id` selection is rejected.
- Unknown or unverified domains fail closed. There is no first-active-restaurant fallback.

## Enforcement layers

1. Host/public-key resolution establishes the tenant.
2. Server handlers validate branch membership and authenticated identity.
3. PostgreSQL RLS restricts rows by customer, staff membership, tenant and branch.
4. Security-definer RPCs repeat permission and branch checks before mutations.
5. Storage policies require the authorized `business_id` path prefix.
6. Tenant-aware responses use no unsafe global tenant cache.

The `enforce_branch_owned_write` trigger rejects mismatched business/branch rows. The `protect_last_owner` trigger blocks removal of a live tenant's final owner. Migrations `202609230001` and `202609230002` preserve those controls while allowing an intentional parent business deletion to cascade, which is required for disposable staging fixture cleanup and future approved offboarding tooling.

## Verified adversarial cases

- Restaurant A staff cannot read or mutate Restaurant B orders, catalog, inventory, reports, payments or storage.
- Branch A1 staff cannot access A2 register/report data without an assignment.
- Multi-branch managers receive only their assigned branches.
- Forged cross-tenant branch IDs are rejected.
- Customer/guest order access requires the correct user or guest tracking token.
- Concurrent catalog requests retain tenant context.
- Checkout ignores client totals and rejects idempotency-key payload conflicts.
- Unauthorized Google/restaurants sessions cannot enter Super Admin routes.

## Operational rules

Never use the service role in a browser, mobile bundle or Desktop POS. Never disable RLS to resolve an application bug. New tables with tenant data require `business_id`, appropriate branch constraints/indexes, RLS policies and cross-tenant tests before release. Production tenant deletion requires a reviewed export/retention decision and explicit approval; the staging cleanup scripts are not production runbooks.
