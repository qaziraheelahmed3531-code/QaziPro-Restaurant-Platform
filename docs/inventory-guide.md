# Inventory guide

Inventory is branch-scoped and recipe-driven.

1. Create suppliers and ingredients, choosing a consistent unit for each ingredient.
2. Set opening stock, minimum stock and latest unit cost.
3. Create recipe rows that map a product or modifier option to ingredient quantities.
4. Create a purchase with line items and receive it once goods are checked. Receiving updates stock and cost and is idempotent.
5. Record spoilage, damage, expiry or preparation waste with a reason.
6. Use manual adjustment only for verified counts and always provide an audit explanation.

When an order reaches DELIVERED, configured recipe quantities are consumed exactly once. Stock movements form the ledger; do not edit totals directly. Low-stock notifications are raised at or below the configured threshold and cleared when replenished. Current food cost is an estimate based on latest ingredient unit cost; historical weighted/FIFO costing is not enabled.
