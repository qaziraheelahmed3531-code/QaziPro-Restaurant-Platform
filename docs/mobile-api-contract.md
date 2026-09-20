# QaziPro Mobile API v1 contract

Status: **FROZEN AFTER STEP 5 VERIFICATION**
Machine-readable specification: `GET /api/v1/openapi`

This document is the source of truth for future Android and iOS clients. Mobile clients must not call Supabase tables directly for commerce operations and must never calculate an authoritative price or total.

## Environments

| Environment | Base URL | Data |
| --- | --- | --- |
| Local | `http://localhost:3000/api/v1` | local Supabase only |
| Staging | `https://qazipro-restaurant-customer-staging.vercel.app/api/v1` | staging Supabase only |
| Production | configured production customer domain + `/api/v1` | production Supabase; not changed in Step 5 |

Custom restaurant domains may use their own `/api/v1`. A shared/native host must send the public restaurant slug in `x-qazipro-restaurant`. Never send or accept a raw `business_id`.

## Common protocol

- JSON over HTTPS. `v1` is additive-only after freeze; breaking changes require `/api/v2`.
- Optional `x-request-id`: 8–100 safe characters. Server generates one if absent and returns it in both `x-request-id` and `meta.requestId`.
- Success: `{ "ok": true, "data": {...}, "meta": { "version": "v1", "requestId": "...", "nextCursor": null }`.
- Failure: `{ "ok": false, "error": { "code": "STABLE_CODE", "message": "safe message", "details": {} }, "meta": {...} }`.
- Growing lists use opaque `cursor` plus `limit` (default 25, maximum 100). Use only `meta.nextCursor`; do not decode it.
- `x-qazipro-branch-id` is the selected branch UUID for branch-owned operations.
- `Authorization: Bearer <Supabase access token>` is required for private customer data. Missing, invalid and expired tokens return `401`.

Common codes: `RESTAURANT_REQUIRED`, `INVALID_RESTAURANT`, `RESTAURANT_NOT_FOUND`, `INTERNAL_TENANT_ID_FORBIDDEN`, `BRANCH_REQUIRED`, `INVALID_BRANCH`, `BRANCH_NOT_FOUND`, `BRANCH_CONTEXT_MISMATCH`, `AUTH_REQUIRED`, `INVALID_ACCESS_TOKEN`, `VALIDATION_FAILED`, `INVALID_CURSOR`, `ORDER_ACCESS_REQUIRED`, `ORDER_NOT_FOUND`, `RATE_LIMITED`, `LOCATION_PROVIDER_UNAVAILABLE`, `SERVICE_UNAVAILABLE`.

## Bootstrap and branch selection

`GET /bootstrap?restaurant={public-slug}` returns only safe branding, currency, timezone, support contacts, active branches, live opening state, supported ordering modes, feature flags, COD payment availability, maintenance state and optional minimum app versions. It never returns database credentials, service keys or internal `business_id`.

The app stores the returned public `restaurantKey`, asks the customer to select a branch when multiple branches exist, then sends its returned UUID as `x-qazipro-branch-id`. `GET /branches` lists branches and `GET /branches/{id}` validates a selection. The server always verifies that the branch belongs to the resolved restaurant.

## Endpoints

| Method | Path | Authentication | Purpose |
| --- | --- | --- | --- |
| GET | `/health` | public | API/database health |
| GET | `/openapi` | public | OpenAPI 3.1 document |
| GET | `/bootstrap` | public | native tenant/app configuration |
| GET | `/branches`, `/branches/{id}` | public | list/validate branch |
| GET | `/catalog` | public + branch | categories, products, branch prices/visibility, variants, modifiers, deals |
| GET/PATCH | `/profile` | bearer | profile read/update |
| GET/POST | `/addresses` | bearer; POST also branch | paginated list/create |
| PATCH/DELETE | `/addresses/{id}` | bearer | update/delete only own restaurant-scoped address |
| POST | `/addresses/{id}/default` | bearer | set own default within restaurant |
| GET | `/location/autocomplete` | public + branch | Geoapify suggestions |
| GET | `/location/reverse` | public + branch | reverse geocode and area match |
| GET | `/delivery/quote` | public + branch | coverage, route distance/time and estimated fee |
| GET | `/promotions` | public | active tenant offers |
| POST | `/promotions/validate` | public + branch | tenant coupon validation; estimate only |
| POST | `/orders` | guest or bearer + branch | authoritative idempotent checkout |
| GET | `/orders` | bearer | paginated tenant order history |
| GET | `/orders/{number}` | bearer or `x-order-token` | private order detail plus reorder payload |
| GET | `/orders/{number}/tracking` | bearer or `x-order-token` | status history and permitted rider location |
| POST | `/orders/{number}/cancel` | bearer or `x-order-token` | database-enforced legal cancellation |
| GET/POST/DELETE | `/favourites` | bearer | tenant-scoped favourites |
| GET | `/loyalty` | bearer | real wallet balance and latest transactions |
| GET | `/payments` | public | safe payment capability; COD only |
| GET/POST/DELETE | `/devices` | bearer | list/register-or-rotate/unregister device tokens |
| GET | `/auth/session` | bearer | validate session |
| POST | `/auth/logout` | bearer | globally revoke current access token session |
| POST | `/auth/password-reset` | public | rate-limited, enumeration-safe reset request |
| GET | `/auth/deep-links` | public | environment callback and route templates |

`/storefront/context` remains a v1 compatibility endpoint. `/storefront/branch` is the sole browser redirect/cookie compatibility endpoint and is not used by native apps.

## Key request schemas

### Address create/update

Create: `label` (`home|work|other`), `deliveryAreaId` UUID, `addressLine1`, optional `addressLine2`, `landmark`, `instructions`, `locationSource`, numeric `latitude` and `longitude`. Update accepts a subset, but branch/restaurant scope is revalidated. Coordinates and delivery area are checked by the same coverage rules as checkout.

### Promotion validation

`{ "code": "SAVE10", "subtotal": 2000 }`. `estimatedDiscount` is display-only. The checkout transaction reloads the promotion and recomputes the final discount.

### Order create

```json
{
  "idempotencyKey": "install-uuid:checkout-uuid",
  "branchId": "uuid-matching-header",
  "serviceMode": "DELIVERY",
  "paymentMethod": "CASH_ON_DELIVERY",
  "customerName": "Customer",
  "customerPhone": "+923001234567",
  "customerEmail": "optional@example.com",
  "deliveryAreaId": "uuid",
  "deliveryAddress": "Full address",
  "deliveryInstructions": "optional",
  "locationSource": "SEARCH",
  "latitude": 33.0,
  "longitude": 73.0,
  "promoCode": "OPTIONAL",
  "loyaltyCoinsToRedeem": 0,
  "items": [{
    "itemKind": "product",
    "productId": "uuid",
    "variantId": "optional-uuid",
    "quantity": 1,
    "modifiers": [{ "groupId": "uuid", "optionId": "uuid" }]
  }]
}
```

The client-generated idempotency key is 8–128 safe characters and is reused for every retry of the same checkout. The database binds it to restaurant, branch, payload hash and customer/guest context. A retry returns the same order; a changed payload with the same key is rejected.

### Device registration

POST `/devices`: `{ "deviceId":"stable-install-id", "platform":"android|ios", "pushToken":"provider-token", "appVersion":"optional", "locale":"optional" }`. Registration is unique per restaurant/customer/device. Token rotation is atomic; a provider token moved to a new installation cannot remain attached to the former user. DELETE uses `?deviceId=...`.

## Authoritative checkout chain

`public restaurant slug → verified business → verified branch → branch catalog override → product → variant → required/allowed modifiers → promotion → loyalty → tax → delivery → total → idempotency row → order snapshot → tracking`.

The database transaction reloads every product, variant, modifier, coupon, loyalty setting, tax setting and branch override. Catalog and delivery quote values are UI previews only. Website, Desktop POS and future native clients share the existing authoritative order rules; service-role credentials never leave the server.

## Order and guest security

Authenticated queries are constrained by `customer_id` and resolved restaurant. Guest detail/tracking/cancel requires the random `x-order-token`; only its SHA-256 hash is stored. Order hashes, rider assignment IDs and internal business IDs are removed from API responses. Cancellation remains limited by the database status/time/payment rules.

## Auth callbacks and deep links

Supabase verification/recovery returns to the environment-owned HTTPS callback. `MOBILE_AUTH_CALLBACK_URL` selects the future universal/app link; `MOBILE_WEB_BASE_URL` selects the web fallback. The app must inspect the callback type, exchange/refresh the Supabase session, then route locally. Order links use `orders/{orderNumber}` and still require bearer or guest token. Android package names, iOS bundle IDs, Universal Links and App Links are intentionally not hardcoded until Step 6.

## Push foundation

`customer_device_tokens` supports multiple devices and token rotation per restaurant/customer. `customer_notification_outbox` is provider-neutral, hidden from client roles and receives deduplicated `ORDER_STATUS_CHANGED` records. A future FCM/APNs worker may consume it without changing API or database ownership. No Firebase/APNs credentials or delivery worker are included yet.

## Intentionally unavailable

- Card/wallet gateways: disabled; `/payments` advertises COD only.
- Push delivery worker and provider credentials: not configured.
- Native bundle identifiers/store signing/universal-link files: deferred to mobile implementation.
- Geoapify routes return `503` when the environment key is absent.
- Loyalty is exposed only where the existing real wallet is configured; no fake points are generated.

## Security invariants

Restaurant context comes from verified domain or public slug, never client `business_id`. Every branch is verified under that restaurant. Private resources are additionally owner-scoped. Service-role access is isolated in server-only modules and each such query includes tenant/customer predicates. RLS protects direct authenticated access. Production fails closed when Supabase configuration is absent; demo behavior requires the explicit development flag.
