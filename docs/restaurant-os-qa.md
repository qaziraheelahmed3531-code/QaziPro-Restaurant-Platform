# Restaurant OS verification — 2026-09-06

## Verified locally

- All versioned migrations and seed apply in an isolated PostgreSQL 18 database with Supabase-compatible Auth/Storage scaffolding.
- `supabase/tests/operations.sql`: real POS transaction, authoritative PKR 699 total, PKR 301 change, retry idempotency, daily token, Kitchen access limits, preparing/ready timestamps, exactly-once recipe consumption, atomic purchase receipt, wastage, cash refund, report reconciliation, drawer reconciliation, customer isolation and anonymous denial.
- `supabase/tests/online-order.sql`: Hamlet Colony delivery, required pizza modifiers, server price calculation ignoring client price, PKR 200 delivery beyond the free distance, token, online-order pause, Admin visibility, fulfillment transitions, customer-directory aggregation and customer tracking history.
- Four concurrent database sessions allocated 100 daily tokens. Result: 100 values, 100 unique, range 001–100.
- Customer, Admin and backend production builds pass. Customer and Admin ESLint pass.
- HTTP smoke checks: customer home/cart/checkout/account/orders each return 200. Admin login returns 200; protected POS redirects with 307; unauthenticated revalidation returns 403; disabled payment webhook returns 503 and an unknown provider returns 404.
- Read-only checks against the configured Supabase REST project returned 404 for `businesses`, `orders`, `register_shifts` and `ingredients`. The platform tables are not currently available through that project's REST schema. Live database integration is therefore not claimed as deployed.

Fixtures are separate from seed and roll back. No fake sales, stock or staff accounts were added to the live system.

## External verification still required

- Live Supabase migration deployment and OWNER provisioning. Admin `.env.local` is absent; the customer environment contains public Auth configuration but no configured server order key or revalidation bridge.
- Authenticated browser checks at 1600, 1440, 1280, 1024, 768, 430 and 390 pixels. The connected browser runtime reported no available browsers; screenshots and visual/E2E results were not fabricated.
- Physical 80/58 mm printer, paper scaling, cutter/cash drawer and any future silent-print middleware.
- Official merchant sandbox credentials and signed webhook implementation for each online payment provider. External providers remain disabled; their webhook endpoint fails closed.
- Vercel deployment, callback URLs and real customer-to-Admin revalidation verification.

## Known product boundaries

- Cash and COD are active paths. A gateway adapter contract and persisted event/transaction/refund schema exist, but there is no configured external gateway.
- Receipt copies and optional kitchen tickets are rendered as a batch for the browser dialog. Silent printing requires separately commissioned middleware/hardware.
- Food cost uses latest ingredient cost, excludes labor/overheads, and requires complete recipes. It is not historical FIFO/weighted-cost accounting.
- Product net sales allocate order discounts proportionally; refunds remain a separate order-level report line. Category contribution is gross item sales. Sales reports measure non-cancelled order totals, while Payment Center measures captured cash/payment transactions; these measure different stages and can differ for unpaid COD orders.
- Server pagination is present for orders, CMS/audit resources, customers and transactions. CMS search is explicitly scoped to the current page.
- Advanced station routing, tax policy, live card/wallet payments and external printer services require the restaurant's operational configuration/approval before launch.
