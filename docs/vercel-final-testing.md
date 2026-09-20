# Italian Pizza — Vercel final testing

This repository is prepared for two independent Next.js deployments that share
the same Supabase project:

| Deployment | Vercel root directory | App |
| --- | --- | --- |
| Customer storefront | `apps/customer` | `npm run build` |
| Restaurant Admin | `apps/admin` | `npm run build` |

## Environment names

Set the following names in the matching Vercel project. Values are never
committed to this repository.

Customer and Admin public/runtime configuration:

- `NEXT_PUBLIC_SUPABASE_URL`
- `NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY`
- `REVALIDATION_SECRET`
- `CUSTOMER_APP_URL` (Admin only)
- `ADMIN_APP_URL` (Customer only, when an admin link is enabled)
- `GEOAPIFY_API_KEY` (server-side only)
- existing Google Reviews / EmbedSocial variables from the app `.env.example`

Admin-only integrations should remain server-side, including
`SUPABASE_SERVICE_ROLE_KEY`, printer bridge settings and payment provider
secrets. Do not expose them with a `NEXT_PUBLIC_` prefix.

## Supabase Auth URLs

1. In Supabase Auth → URL Configuration, set the production Site URL to the
   customer deployment URL.
2. Add the customer callback URL:
   `https://<customer-domain>/auth/callback`
3. Add the admin callback URL:
   `https://<admin-domain>/auth/callback`
4. Keep localhost callback URLs during staging. Remove them only after the
   production smoke test is complete.
5. In the Google OAuth client, add both production callback URLs under
   Authorized redirect URIs. The callback host must match each deployment.

Customer and Admin use separate cookie namespaces (`italian-pizza-customer-auth`
and `italian-pizza-admin-auth`) so signing out of one deployment does not sign
out the other.

## Deployment smoke checklist

- Customer and Admin builds pass from their configured root directories.
- Google sign-in returns to the correct app.
- Eight-digit email OTP returns to the correct app.
- Customer sign-out leaves an Admin session intact, and vice versa.
- Guest delivery and pickup checkout both remain available.
- A website order appears in Admin without a manual refresh; polling remains a
  fallback if Realtime is unavailable.
- Admin can print both receipt widths configured in Print Settings.
- Customer tracking receives a real status update; rider artwork is explicitly
  status progress, not GPS.
- Delivery setup saves the restaurant origin and active areas before placing a
  delivery order.
- A pin outside active coverage is rejected server-side.
- Review links and the configured review widget load without exposing keys.

## Database release order

Apply Supabase migrations in filename order, including
`202609080001_production_delivery_and_crm.sql`, before enabling the universal
delivery setup in production. Run the two-account ownership and RLS tests from
`supabase/tests` against a staging project first.
