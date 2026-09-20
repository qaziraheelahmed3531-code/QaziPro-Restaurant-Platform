# Customer Data Migration

## What changed

The customer UI structure remains intact, but its operational inputs now come from a server-created `StorefrontSnapshot`:

- static branding → `businesses` + `business_branding`
- static announcement/review presentation → `site_settings`
- static hero/category/menu/deals → database rows
- pizza-only options → generic assigned modifier groups/options
- static delivery areas/aliases/rule/origin → branch tables
- local order authority → trusted API + transactional PostgreSQL command
- authenticated local addresses → customer-owned database rows
- static search index → current snapshot products/deals

## Compatibility fallback

The existing demo data remains in `lib/storefront/fallback.ts`. It is used only if public Supabase configuration/schema is unavailable. This protects the current website during staged deployment. Orders created while explicitly in fallback mode remain local demo orders; database mode never falls back silently after a failed server order.

## Browser storage retained

Cart, location convenience state and guest address convenience still use localStorage. They are not trusted by the server. Guest order access tokens are browser-local; only hashed tokens are stored in PostgreSQL. Legacy browser orders remain viewable alongside database orders.

## Rollout sequence

1. Apply migrations and seed in a non-production Supabase project.
2. Bootstrap the OWNER membership.
3. Configure customer/admin environments and Supabase redirect URLs.
4. Confirm the customer snapshot reports database-backed content.
5. Verify product/modifier/deal/order paths with test data.
6. Deploy admin, configure real restaurant content/media/origin/hours.
7. Remove or reduce fallback content only in a later approved cleanup after production data is complete.

## Preserved integrations

Supabase Google/email authentication, Geoapify autocomplete/reverse/routing, deterministic aliases including Hamlet → Hamlet Colony, Google Places metadata and EmbedSocial remain in place.
