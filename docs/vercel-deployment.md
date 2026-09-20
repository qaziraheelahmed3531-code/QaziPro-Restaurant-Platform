# Vercel Deployment

Create two Vercel projects from the same repository.

## Customer project

- Root directory: `apps/customer`
- Framework: Next.js
- Install: `npm install`
- Build: `npm run build`
- Output: Next.js default
- Add all names from `apps/customer/.env.example` that apply to the selected integrations.

Required for database ordering: `NEXT_PUBLIC_SUPABASE_URL`, `NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY`, `SUPABASE_SERVICE_ROLE_KEY`, `GEOAPIFY_API_KEY`, restaurant origin in Admin (or the two origin env fallbacks), and `REVALIDATION_SECRET`.

## Admin project

- Root directory: `apps/admin`
- Framework: Next.js
- Install: `npm install`
- Build: `npm run build`
- Add `NEXT_PUBLIC_SUPABASE_URL`, `NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY`, `CUSTOMER_APP_URL` and the same `REVALIDATION_SECRET`.

## Backend/shared

No third Vercel service is necessary. Trusted route handlers deploy with the customer/admin applications; Supabase hosts database/Auth/Storage. `apps/backend` can be built in CI with `npm run build` to validate the documented boundary.

## Post-deploy checklist

1. Apply Supabase migrations and configure OWNER before exposing the admin URL.
2. Add exact production and preview callback URLs to Supabase Auth.
3. Set `CUSTOMER_APP_URL` to the public customer deployment.
4. Use a long random revalidation secret in both projects.
5. Confirm service-role and provider keys are Server-only, never prefixed `NEXT_PUBLIC_`.
6. Test admin authorization with an owner, staff member, normal customer and signed-out browser.
7. Test product/banner/delivery edits, then a real COD order/status update.
8. Inspect Vercel logs without logging request secrets, guest tokens or exact customer coordinates.

No domain or production environment has been changed by this implementation.

## Restaurant operations upgrade

Apply `202609060001_operational_enums.sql` as its own committed migration before `202609060002_restaurant_operations.sql`, then apply `202609060003_operations_hardening.sql` and every subsequent versioned migration. Do not squash the enum additions into the same transaction that first uses them.

Enable Realtime publication for orders (the operations migration adds it when the Supabase publication exists). Verify that the published table is accessible only through its RLS policies. Run cashier, kitchen, manager and owner sessions separately after deployment.

Cash is the launch-safe payment configuration. Merchant approval, signed webhook implementation and sandbox tests are required before enabling any online provider. Thermal output requires a local printer/driver; Vercel does not provide silent printer access.

Build from the workspace root with `npm run build`; each Vercel project should allow source files outside its root directory so the shared workspace package resolves. Keep the repository-root lockfile as the authoritative workspace dependency lock.
