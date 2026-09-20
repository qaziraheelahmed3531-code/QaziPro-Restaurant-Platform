# Mobile API contract - Step 5 gate

Status: **NOT READY / NOT FROZEN**. The implemented API has passed its covered cases over public HTTPS, but required mobile endpoints and the exact custom-domain gate remain open.

## Transport and tenancy

- Base URL is the resolved restaurant HTTPS domain, never a shared unscoped fallback.
- Native clients send `x-qazipro-branch-id` after selecting a branch.
- Authenticated routes use `Authorization: Bearer <Supabase access token>`.
- Mutating requests send a client-generated idempotency key.
- Responses use `{ ok, data, meta }` or `{ ok:false, error:{ code, message, details? }, meta }`.
- `meta.version` is `v1`; critical responses include `meta.requestId` and `x-request-id`.
- Clients receive only the Supabase publishable key. The service-role key remains server-only.

## Implemented and verified over public HTTPS

| Method | Endpoint | Purpose |
| --- | --- | --- |
| GET | `/api/v1/health` | API/database health without secret disclosure |
| GET | `/api/v1/storefront/context` | Domain-to-business resolution, available branches and selected branch |
| GET | `/api/v1/storefront/branch?branch=<uuid>` | Browser branch-cookie selection; native clients use the branch header |
| GET | `/api/v1/catalog` | Branch-aware sections, products, variants, modifiers and deals |
| POST | `/api/v1/orders` | Authoritative checkout, tax/delivery, coupon, idempotency and guest/auth orders |
| GET | `/api/v1/orders` | Bearer-authenticated customer order history |

Public tests verified valid bearer use, invalid bearer rejection, tenant/branch isolation, variant/modifier pricing, coupons, tax, pickup checkout, order history, idempotency, rate limiting, and the common error envelope. The delivery route remains pending a staging Geoapify key. Expired-token behavior and exact custom-domain auth callbacks still require final browser verification.

## Genuine gaps before contract freeze

These capabilities are not yet exposed through the consistent bearer-authenticated `/api/v1` boundary:

- customer profile read/update
- customer address list/create/update/delete
- order detail, tracking and customer cancellation
- promotion validation without creating an order
- favourites and loyalty wallet
- location autocomplete, place, reverse-geocode and route contract
- password-reset UX and native deep-link callback contract

Tax, delivery, coupon and item pricing remain authoritative in `POST /api/v1/orders`; clients must never treat locally calculated totals as authoritative.

## Freeze criteria

Mark this contract `READY` only after:

1. the three exact custom domains resolve publicly with valid HTTPS;
2. login, logout, reset, valid/invalid/expired bearer flows pass there;
3. the missing mobile endpoints above are implemented without duplicating pricing or authorization rules;
4. delivery, checkout/idempotency, order tracking and cross-tenant tests all pass publicly;
5. the request/response schemas are versioned and frozen for Android/iOS.
