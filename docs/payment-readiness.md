# Payment Readiness

Real payment integration is intentionally not implemented.

## Ready foundations

- Controlled `payment_method` values: `CASH_ON_DELIVERY`, future `ONLINE`.
- Controlled `payment_status`: `UNPAID`, `PENDING`, `PAID`, `FAILED`, `REFUNDED`.
- Nullable `payment_reference` for future provider reconciliation.
- Server-authoritative product, modifier, promotion, delivery and grand-total calculation.
- Atomic order creation with durable item price snapshots.
- Admin order detail shows payment method/status.
- Admin Payments page clearly reports Not configured.
- Current order command rejects every method except COD.

## Required before enabling online payment

1. Select a provider and document signature/webhook requirements.
2. Add a private payment-attempt table with idempotency keys, provider state and non-sensitive response metadata.
3. Create server-only checkout-session and webhook handlers.
4. Verify webhook signatures against raw request bodies.
5. Make webhook transitions idempotent and constrain allowed payment/order state changes.
6. Recalculate/lock the payable amount server-side immediately before provider session creation.
7. Add timeout, cancellation, refund and reconciliation workflows.
8. Add provider sandbox E2E/security tests and operational alerts.

Never store card data, merchant credentials or webhook secrets in public settings tables or browser code.
