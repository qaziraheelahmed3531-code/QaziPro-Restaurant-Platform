# Reporting guide

Dashboard and Reports use the `restaurant_report` PostgreSQL function with an explicit time range and optional branch. It returns server-aggregated summary, sales trend, channel/payment mix, status totals, top products/categories and peak hours. Presets cover today, yesterday, 7/30 days, month and year; CSV export contains the aggregated trend.

Gross sales means persisted order subtotal before discount. Net sales is order total less successful refunds in the selected range. Delivery and tax are shown separately. Cancelled orders are excluded. Cash reconciliation uses paid cash transactions tied to a register shift, less successful cash refunds, plus cash-in and minus cash-out movements.

The business timezone is `Asia/Karachi`; timestamps remain timezone-safe in PostgreSQL. Before financial sign-off, compare a day’s report to the transaction ledger and closed-shift summaries. Product net sales allocate order discounts proportionally; refunds are reported separately at order level. Category contribution is gross item value. Historical ingredient-cost accounting is not a general-ledger feature.

Sales reports include non-cancelled orders, including unpaid COD orders. Payment Center separately aggregates captured transactions and successful refunds across the full ledger. Do not interpret pending COD order value as cash already received. The reporting range selects an order cohort; subsequent refunds on those orders reduce that cohort's net value.
