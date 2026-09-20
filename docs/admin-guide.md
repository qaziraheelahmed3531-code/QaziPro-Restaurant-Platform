# Admin Guide

## Sign in and authorization

Open the admin deployment `/login` and use Google or an email secure link. Authentication alone is not sufficient: the account must have an active `staff_memberships` row. Unauthorized customers are returned to login and database RLS denies direct requests.

## Recommended first setup

Use **Business Setup** in this order:

1. Business details and branch.
2. Appearance/logo.
3. Delivery origin, rule and supported areas.
4. Seven weekly opening-hour rows.
5. Categories, products, product images and modifier assignments.
6. Deals and included items.
7. Hero banners.
8. Review presentation.
9. Keep Payments as Not configured.

## Daily operations

- **Dashboard:** real orders, pending count, revenue, average order, customers, top product and status totals.
- **Orders:** filter/search, open full order detail and move the controlled status. Customer tracking refreshes actual persisted status.
- **Menu:** manage product price/availability, images and modifier assignments. Deactivate products needed by historical orders.
- **Categories:** name, slug, imagery, section content and order.
- **Modifiers:** create reusable group rules and priced options, then assign groups under Menu.
- **Deals:** schedule offers and document included products.
- **Banners:** upload and schedule image-only hero/campaign artwork.
- **Delivery:** configure origin, free distance, extra-km rate, aliases and active areas.
- **Hours/Business:** manage branch availability and temporary closure.
- **Customers:** operational aggregates only; passwords and OTP secrets are never available.
- **Users & Roles:** OWNER-only memberships. Use the user's Supabase Auth UUID.
- **Audit Logs:** immutable operational change history.

## Roles

- OWNER: all controls including staff roles.
- MANAGER: business/menu/orders/customers/promotions/audit operations.
- STAFF: limited order access/status operations.

## Media rules

Use PNG/JPG/WebP, or SVG only in buckets that allow it. Files are capped by both the admin UI and bucket policy. Uploading stores a collision-safe path; save the database record to publish it. Deleting a media record does not automatically remove an object that may still be referenced elsewhere—storage cleanup should be deliberate.

## Safety notes

Do not place API keys in Reviews/Integrations. Only public widget identifiers belong there. Admin forms warn before browser unload when dirty and destructive operations require confirmation.
