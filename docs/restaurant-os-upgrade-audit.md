# Italian Pizza Restaurant OS upgrade audit

Audit date: 2026-09-06  
Repository: `D:\WebProjects\ITALIAN-PIZZA`

## Currently complete

- Customer storefront: responsive menu, deals, search, generic modifiers, cart, delivery/pickup location, checkout, order history/tracking, Supabase authentication, Geoapify and Google/EmbedSocial reviews.
- Core commerce persistence: normalized business/menu/delivery/customer/order schema, customer RLS, staff membership checks, media buckets, authoritative COD order RPC and status history.
- Initial admin: authenticated shell, OWNER/MANAGER/STAFF membership guard, dashboard, orders, menu/CMS/delivery CRUD, customers, audit log and setup checklist.
- Deployment baseline: separate customer/admin Next.js applications, shared TypeScript package, Supabase migrations and Vercel documentation.

## Partially complete before this upgrade

- Dashboard only exposed current-day counts and did not support business-timezone ranges, comparisons or operational charts.
- Orders supported status edits but not tokens, channels, constrained transitions, realtime notifications or kitchen workflow timestamps.
- Payments had order placeholders but no transaction ledger, provider contract, reconciliation or refund model.
- Roles existed, but CASHIER and KITCHEN operational roles and granular permission enforcement were missing.
- Business handover covered commerce configuration but not registers, printing, inventory, payments or staff readiness.

## Missing before this upgrade

- Counter POS, daily branch token sequence, held orders and cash change flow.
- Customer/kitchen thermal receipt layouts and printer abstraction.
- Cash register shifts, cash-in/out movements and reconciliation.
- Kitchen Display System, elapsed timers and prep-time reporting.
- Ingredients, recipes, stock movements, food cost, suppliers, purchasing, receiving, wastage and low-stock notifications.
- Aggregated daily/weekly/monthly/yearly sales, channel, payment, product, category, customer, stock and shift reports.
- Payment provider adapter boundary, transaction/event ledger, refunds and reconciliation.
- Notification center, global operational search, print settings and safe system-health view.

## Broken or not deployed

- No source-level build break was present at audit time.
- Live Supabase deployment cannot be inferred from repository files. Migrations and seed remain manual deployment steps.
- Customer order persistence requires a server-only Supabase service-role value; its presence must be checked per deployment without exposing it.
- Browser printing is supported by browsers, but silent printing requires future restaurant-selected hardware middleware.

## Duplicated and hardcoded

- Customer fallback menu/location content remains intentionally available only when Supabase is not configured; it is not production authority.
- Some initial dashboard date logic used the server machine's midnight instead of the business timezone.
- Role capability assumptions were spread between navigation and table managers; this upgrade centralizes permission codes.

## Security risks identified

- Existing `orders_staff_update` permitted all legacy staff to update status without validating legal workflow transitions.
- The initial role enum could not represent cashier- or kitchen-only access.
- Operational mutations needed transactional RPC boundaries so browser clients could not directly set totals, stock, tokens, register reconciliation or refund states.
- Payment credentials must remain environment-only. No arbitrary secret editor should be exposed in admin.

## UX problems identified

- The original sidebar was dark, flat and increasingly crowded.
- No branch context, notification center or global search existed in the top bar.
- Operational surfaces required purpose-built POS/KDS layouts rather than generic CRUD tables.
- Important forms did not yet include printing, stock, purchasing or shift workflows.

## Performance problems identified

- Dashboard aggregation loaded bounded raw rows and calculated in the Next.js process.
- Operational lists needed purpose-built indexes and bounded server/database aggregation.
- Realtime consumers needed cleanup and polling fallback rather than full-page refresh loops.

## Upgrade strategy

1. Add enum values in an isolated migration so PostgreSQL commits them before they are used.
2. Add operational tables, indexes, RLS, audit triggers and transactional RPCs in a following migration.
3. Extend shared domain contracts and payment/printer abstractions.
4. Upgrade the admin shell and add POS, KDS, register, inventory, purchasing, reporting, payments, notifications and system health.
5. Preserve the customer visual system; only expose real token/channel data and retain status polling.
6. Validate migrations in an isolated PostgreSQL database, then run lint and all three production builds.

