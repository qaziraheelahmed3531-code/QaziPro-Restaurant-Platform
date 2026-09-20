# Database Schema

Migrations:

1. `supabase/migrations/202609050001_initial_platform.sql`
2. `supabase/migrations/202609050002_order_commands.sql`
3. Optional development content: `supabase/seed.sql`

## Main relationships

- `businesses` owns branding, site settings, branches, categories, products, modifiers, deals, banners, promotions, staff and audit logs.
- `branches` owns weekly hours, delivery areas and one active delivery rule. This keeps the current single-branch UI ready for multiple branches.
- `products` belongs to a category and has images, variants and assigned modifier groups.
- `modifier_groups` has options; the product assignment table controls reuse and display order.
- `deals` has optional included `deal_items`; order lines can snapshot either a product or a deal.
- `orders` snapshots customer, delivery, payment and totals. `order_items` and `order_item_modifiers` snapshot labels/prices so historical orders survive menu changes.
- `order_status_history` records controlled status progression.
- `profiles` and `customer_addresses` are owned by Supabase users.
- `staff_memberships` separates customer identity from staff authorization.

## Controlled enums

- Staff: `OWNER`, `MANAGER`, `STAFF`
- Service mode: `DELIVERY`, `PICKUP`
- Status: `RECEIVED`, `CONFIRMED`, `PREPARING`, `READY`, `OUT_FOR_DELIVERY`, `DELIVERED`, `CANCELLED`
- Payment methods: `CASH_ON_DELIVERY`, `ONLINE`
- Payment status: `UNPAID`, `PENDING`, `PAID`, `FAILED`, `REFUNDED`

## Server-authoritative order command

`create_order_authoritative(jsonb, uuid)` is executable only by `service_role`. It validates the active business/branch, temporary closure and weekly hours; requires a supported delivery area; checks product/deal availability and modifier min/max rules; rejects duplicate modifiers and non-COD payment; loads all prices; applies active promotions; calculates delivery with the stored rule; writes items/modifiers/status history in one transaction; and returns the durable order number plus a guest token when applicable.

## RLS summary

- Anonymous users can read only public active storefront rows.
- Customers can read/update their profile, addresses and own orders only.
- Staff reads/writes require an active business membership.
- OWNER/MANAGER handle configuration; STAFF has limited order operations.
- OWNER alone manages staff memberships.
- Service-role access is restricted to server route handlers and the order command.

## Storage

Public delivery buckets are `business-logos`, `hero-banners`, `category-images` and `product-images`. Writes require OWNER/MANAGER membership and the first object-path segment must equal the staff member's business UUID.

## Historical integrity

Products/deals are soft-deactivated instead of deleted through normal admin flows. Order lines store immutable display/price snapshots. Foreign keys use `set null` where a historical snapshot must remain readable.
