# QaziPro restaurant platform feature parity

Status is based on executable code and the Step 2–8 verification suites, not on screen presence alone.

Legend: **SUPPORTED**, **NOT APPLICABLE**, **EXTERNAL BLOCKER**, **MISSING**.

| Feature | Admin | Website | Android | iOS | Web POS | Desktop POS | Kitchen | Backend |
| --- | --- | --- | --- | --- | --- | --- | --- | --- |
| Tenant resolution by verified domain/public key | SUPPORTED | SUPPORTED | SUPPORTED | SUPPORTED | SUPPORTED | SUPPORTED | SUPPORTED | SUPPORTED |
| Restaurant name/logo/colors/contact | SUPPORTED | SUPPORTED | SUPPORTED | SUPPORTED | SUPPORTED | SUPPORTED | SUPPORTED | SUPPORTED |
| White-label domain/app identity | SUPPORTED | SUPPORTED | SUPPORTED | SUPPORTED | NOT APPLICABLE | NOT APPLICABLE | NOT APPLICABLE | SUPPORTED |
| Branch selection and isolation | SUPPORTED | SUPPORTED | SUPPORTED | SUPPORTED | SUPPORTED | SUPPORTED | SUPPORTED | SUPPORTED |
| Opening hours and temporary closure | SUPPORTED | SUPPORTED | SUPPORTED | SUPPORTED | SUPPORTED | SUPPORTED | SUPPORTED | SUPPORTED |
| Categories and ordering | SUPPORTED | SUPPORTED | SUPPORTED | SUPPORTED | SUPPORTED | SUPPORTED | NOT APPLICABLE | SUPPORTED |
| Product images, prices and availability | SUPPORTED | SUPPORTED | SUPPORTED | SUPPORTED | SUPPORTED | SUPPORTED | SUPPORTED | SUPPORTED |
| Branch price/visibility/stock overrides | SUPPORTED | SUPPORTED | SUPPORTED | SUPPORTED | SUPPORTED | SUPPORTED | SUPPORTED | SUPPORTED |
| Variants | SUPPORTED | SUPPORTED | SUPPORTED | SUPPORTED | SUPPORTED | SUPPORTED | SUPPORTED | SUPPORTED |
| Modifiers/add-ons | SUPPORTED | SUPPORTED | SUPPORTED | SUPPORTED | SUPPORTED | SUPPORTED | SUPPORTED | SUPPORTED |
| Deals | SUPPORTED | SUPPORTED | SUPPORTED | SUPPORTED | SUPPORTED | SUPPORTED | SUPPORTED | SUPPORTED |
| Hero banners | SUPPORTED | SUPPORTED | SUPPORTED | SUPPORTED | NOT APPLICABLE | NOT APPLICABLE | NOT APPLICABLE | SUPPORTED |
| Menu search | NOT APPLICABLE | SUPPORTED | SUPPORTED | SUPPORTED | SUPPORTED | SUPPORTED | NOT APPLICABLE | NOT APPLICABLE |
| Favourites | SUPPORTED | SUPPORTED | SUPPORTED | SUPPORTED | NOT APPLICABLE | NOT APPLICABLE | NOT APPLICABLE | SUPPORTED |
| Loyalty wallet/redemption | SUPPORTED | SUPPORTED | SUPPORTED | SUPPORTED | NOT APPLICABLE | NOT APPLICABLE | NOT APPLICABLE | SUPPORTED |
| Coupons/promotions | SUPPORTED | SUPPORTED | SUPPORTED | SUPPORTED | SUPPORTED | SUPPORTED | NOT APPLICABLE | SUPPORTED |
| Customer profile and addresses | SUPPORTED | SUPPORTED | SUPPORTED | SUPPORTED | NOT APPLICABLE | NOT APPLICABLE | NOT APPLICABLE | SUPPORTED |
| Saved address selection during checkout | NOT APPLICABLE | SUPPORTED | SUPPORTED | SUPPORTED | NOT APPLICABLE | NOT APPLICABLE | NOT APPLICABLE | SUPPORTED |
| Pickup checkout | SUPPORTED | SUPPORTED | SUPPORTED | SUPPORTED | SUPPORTED | SUPPORTED | SUPPORTED | SUPPORTED |
| Geo delivery quote | SUPPORTED | EXTERNAL BLOCKER | EXTERNAL BLOCKER | EXTERNAL BLOCKER | NOT APPLICABLE | NOT APPLICABLE | NOT APPLICABLE | EXTERNAL BLOCKER |
| Server-authoritative tax/discount/delivery/total | SUPPORTED | SUPPORTED | SUPPORTED | SUPPORTED | SUPPORTED | SUPPORTED | SUPPORTED | SUPPORTED |
| Checkout idempotency | NOT APPLICABLE | SUPPORTED | SUPPORTED | SUPPORTED | SUPPORTED | SUPPORTED | NOT APPLICABLE | SUPPORTED |
| COD capability | SUPPORTED | SUPPORTED | SUPPORTED | SUPPORTED | SUPPORTED | SUPPORTED | NOT APPLICABLE | SUPPORTED |
| External online payment | EXTERNAL BLOCKER | EXTERNAL BLOCKER | EXTERNAL BLOCKER | EXTERNAL BLOCKER | NOT APPLICABLE | NOT APPLICABLE | NOT APPLICABLE | EXTERNAL BLOCKER |
| Guest order and secure guest tracking | SUPPORTED | SUPPORTED | SUPPORTED | SUPPORTED | NOT APPLICABLE | NOT APPLICABLE | NOT APPLICABLE | SUPPORTED |
| Authenticated history/tracking/reorder | SUPPORTED | SUPPORTED | SUPPORTED | SUPPORTED | SUPPORTED | SUPPORTED | SUPPORTED | SUPPORTED |
| Customer cancellation | SUPPORTED | SUPPORTED | SUPPORTED | SUPPORTED | SUPPORTED | SUPPORTED | SUPPORTED | SUPPORTED |
| Legal status transitions | SUPPORTED | SUPPORTED | SUPPORTED | SUPPORTED | SUPPORTED | SUPPORTED | SUPPORTED | SUPPORTED |
| Replacement/refund | SUPPORTED | NOT APPLICABLE | NOT APPLICABLE | NOT APPLICABLE | SUPPORTED | SUPPORTED | NOT APPLICABLE | SUPPORTED |
| POS sections and section sales reports | SUPPORTED | NOT APPLICABLE | NOT APPLICABLE | NOT APPLICABLE | SUPPORTED | SUPPORTED | SUPPORTED | SUPPORTED |
| Inventory/stock movements | SUPPORTED | NOT APPLICABLE | NOT APPLICABLE | NOT APPLICABLE | SUPPORTED | SUPPORTED | SUPPORTED | SUPPORTED |
| Receipts/KOT and print controls | SUPPORTED | NOT APPLICABLE | NOT APPLICABLE | NOT APPLICABLE | SUPPORTED | SUPPORTED | SUPPORTED | SUPPORTED |
| Push-token lifecycle | NOT APPLICABLE | NOT APPLICABLE | SUPPORTED | SUPPORTED | NOT APPLICABLE | NOT APPLICABLE | NOT APPLICABLE | SUPPORTED |
| Real FCM/APNs delivery | NOT APPLICABLE | NOT APPLICABLE | EXTERNAL BLOCKER | EXTERNAL BLOCKER | NOT APPLICABLE | NOT APPLICABLE | NOT APPLICABLE | EXTERNAL BLOCKER |
| Password reset/deep-link routing | NOT APPLICABLE | SUPPORTED | SUPPORTED | SUPPORTED | NOT APPLICABLE | NOT APPLICABLE | NOT APPLICABLE | SUPPORTED |
| Verified App/Universal Links | NOT APPLICABLE | NOT APPLICABLE | EXTERNAL BLOCKER | EXTERNAL BLOCKER | NOT APPLICABLE | NOT APPLICABLE | NOT APPLICABLE | SUPPORTED |
| Staff roles and branch permissions | SUPPORTED | NOT APPLICABLE | NOT APPLICABLE | NOT APPLICABLE | SUPPORTED | SUPPORTED | SUPPORTED | SUPPORTED |
| Restaurant/branch reports | SUPPORTED | NOT APPLICABLE | NOT APPLICABLE | NOT APPLICABLE | SUPPORTED | SUPPORTED | NOT APPLICABLE | SUPPORTED |

## Source-of-truth mapping

| Admin-owned data | Website | Mobile | POS/Desktop/Kitchen |
| --- | --- | --- | --- |
| `businesses`, `business_branding`, `site_settings` | Server storefront snapshot plus realtime refresh | `/api/v1/bootstrap`; refreshed on launch/pull | POS catalog/branding sync |
| `branches`, `business_hours`, `delivery_rules`, `delivery_areas` | Tenant + selected-branch snapshot | Bootstrap, branch and delivery endpoints | Authenticated branch sync |
| `categories`, `products`, `product_variants`, modifiers, deals | Storefront snapshot | `/api/v1/catalog` | Branch-aware POS catalog/RPC snapshot |
| `branch_product_overrides` | Applied server-side | Applied before catalog response | Applied by POS/desktop catalog path |
| `promotions`, `loyalty_settings`, operating tax settings | Authoritative endpoints/checkout | Same `/api/v1` rules | Shared database/RPC authority where applicable |
| `print_settings`, `invoice_settings`, `pos_sections` | Not customer-facing | Not customer-facing | POS, Desktop and KDS sync/read these settings |

The client never chooses a raw `business_id`. Domain or public restaurant key resolves the business, and the selected branch is revalidated against it.
