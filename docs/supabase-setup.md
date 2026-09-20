# Supabase Setup

## 1. Apply schema

Run the two migration files in filename order using the Supabase CLI migration workflow or the SQL editor for the target project. Then run `supabase/seed.sql` only for the demo/development environment. Do not paste service-role keys into SQL or source control.

## 2. Configure Auth

Enable Google and email OTP/secure-link providers as needed. Add customer and admin callback URLs:

- Customer: `https://<customer-host>/auth/callback`
- Admin: `https://<admin-host>/auth/callback`
- Local customer/admin callbacks for their respective ports.

Set the Supabase Site URL to the intended primary customer URL and include every preview/demo callback explicitly.

## 3. Bootstrap the first owner

First sign in through Supabase Auth, then obtain that user's UUID in the Auth Users screen. Run once with the actual UUID:

```sql
insert into public.staff_memberships (business_id, user_id, role)
values ('11111111-1111-4111-8111-111111111111', '<AUTH_USER_UUID>', 'OWNER')
on conflict (business_id, user_id)
do update set role = 'OWNER', is_active = true;
```

This manual bootstrap is intentionally required; a normal customer cannot promote themselves.

## 4. Required deployment variables

Customer public:

- `NEXT_PUBLIC_SUPABASE_URL`
- `NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY`

Customer server:

- `SUPABASE_SERVICE_ROLE_KEY`
- `REVALIDATION_SECRET`
- existing Geoapify/Google/review variables listed in `apps/customer/.env.example`

Admin public:

- `NEXT_PUBLIC_SUPABASE_URL`
- `NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY`

Admin server:

- `CUSTOMER_APP_URL`
- `REVALIDATION_SECRET`

The admin app does not require the service-role key for ordinary CRUD because staff RLS handles it.

## 5. Configure business data

Set real delivery origin coordinates before testing delivery orders. Verify branch hours, active delivery areas, menu availability and COD. Upload production media through the admin app.

## 6. Security verification

- Anonymous storefront selects succeed only for active rows.
- Customer A cannot read Customer B's profile, addresses or orders.
- A normal authenticated customer cannot access admin data or mutate menu rows.
- STAFF cannot edit configuration or staff memberships.
- OWNER/MANAGER uploads fail if the object path is not under their business UUID.
- Direct authenticated execution of `create_order_authoritative` is denied.

Use separate test users for these checks. Never test RLS using a service-role client because it bypasses policies.
