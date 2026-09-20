# Payment architecture

Cash is the only configured production payment method. COD and counter cash remain usable without a gateway.

`apps/backend/src/payments.ts` defines the provider contract for checkout creation, raw-body webhook verification, status lookup and refunds. Safepay, PayFast, JazzCash and Easypaisa are represented by disabled adapters only. No endpoint URL, signature algorithm or success response has been invented.

The database stores provider configuration state, idempotent transactions, immutable webhook-event identities and refunds. Manual cash refunds are permission-checked, cannot exceed the paid amount, update transaction/order status and create an audit notification. Provider refunds must call the configured provider first and persist the verified result transactionally.

## Enabling a provider

1. Obtain official current API/webhook documentation and merchant sandbox credentials.
2. Implement an adapter and signature verification using the unmodified raw request body.
3. Store secrets only in server environment variables; never use `NEXT_PUBLIC_`.
4. Create pending transactions with unique idempotency keys.
5. Accept only signed, supported events; store provider event IDs before processing duplicates.
6. Reconcile with provider status and test duplicate/out-of-order webhooks.
7. Complete refund, expiry, cancellation and failure tests in sandbox before switching to live mode.

Until these steps are complete, the UI correctly reports online payments as unavailable.

The Admin webhook route `/api/payments/webhooks/[provider]` currently returns 503 for a recognized disabled provider and 404 for an unknown provider. It does not read, trust or persist unsigned payment events. This is a fail-closed deployment boundary, not a claimed working signature implementation.

Cash refunds are attributed to the open cash drawer that returns the money. If the original sale's shift is closed, an authorized operator must open a new shift; the earlier reconciled shift remains unchanged. A refund cannot exceed the remaining original payment amount.
