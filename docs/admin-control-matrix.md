# Italian Pizza — Admin Control Matrix

Classification:

- **A — Admin-controlled:** editable through authorized admin UX.
- **B — System-controlled:** enforced by application/database workflow.
- **C — Environment/server secret:** deployment configuration; never public database content.
- **D — Customer/user-generated:** owned by the authenticated customer or submitted with an order.
- **E — Computed:** derived server-side from authoritative data.

## Business, branding and shell

| Customer-visible field/capability | Class | Admin surface / owner |
|---|---:|---|
| Restaurant legal/display name | A | Business → General |
| Short description | A | Business → General |
| Header/location/footer logo | A | Appearance; Supabase Storage |
| Favicon | A | Appearance |
| Primary/secondary approved colors | A | Appearance with validated palette input |
| Phone, WhatsApp, email | A | Business → General |
| Restaurant address and city | A | Business/Branch |
| Currency (`PKR`) | A | Business; constrained enum |
| Timezone (`Asia/Karachi`) | A | Business; constrained timezone |
| Footer description | A | Business/Appearance |
| Social link labels and URLs | A | Business/Social links |
| Navigation structure and accessibility semantics | B | Application code |
| Current year/copyright formatting | E | Server/runtime |

## Operations and branches

| Field | Class | Admin surface / owner |
|---|---:|---|
| Branch name, code, contact and address | A | Business → Branches |
| Branch coordinates | A | Delivery/Branch settings |
| Delivery/pickup availability | A | Branch operations |
| Weekly opening hours | A | Business → Hours |
| Temporary closure | A | Business → Hours |
| Current open/closed state | E | Branch hours + timezone + closure flag |
| Pickup preparation label/time | A | Branch operations |
| Selected customer service mode | D | Customer selection |
| Selected customer area/location | D | Customer selection |
| Effective branch selection | E | Location + active branch coverage |

## Homepage and banners

| Field | Class | Admin surface / owner |
|---|---:|---|
| Announcement text/visibility | A | Site settings |
| Hero image, alt text, active dates, sort order | A | Banners |
| Hero carousel interval/motion safety | B | Application code |
| Category image/banner/description/order | A | Categories |
| Trust-strip labels/descriptions | B | Product UX copy in application code |
| Mobile/desktop responsive behavior | B | Application code |

## Menu and products

| Field | Class | Admin surface / owner |
|---|---:|---|
| Product name, slug, description | A | Menu → Products |
| Category assignment | A | Menu → Products |
| Base/sale/old price | A | Menu → Products |
| Product images and alt text | A | Menu → Products/Storage |
| Badge, featured state, sort order | A | Menu → Products |
| Availability/archive state | A | Menu → Products |
| Customer search query | D | Customer input |
| Search results/order | E | Active database menu + search rules |
| Displayed effective price | E | Active sale/base price |
| Product card UI and responsive treatment | B | Application code |

## Modifiers and deals

| Field | Class | Admin surface / owner |
|---|---:|---|
| Modifier group name/type/required/min/max/order | A | Modifiers |
| Modifier option name/price/default/availability | A | Modifiers |
| Product-to-group assignment | A | Product editor |
| Customer modifier selections | D | Customer cart/order input |
| Valid selection state and modifier charge | E | Server validation/calculation |
| Deal name, description, image, price, old price | A | Deals |
| Deal active dates/order | A | Deals |
| Deal included items/options | A | Deals |
| Deal availability/effective price | E | Deal rules + active products/time |

## Cart, discounts and totals

| Field | Class | Admin surface / owner |
|---|---:|---|
| Cart quantities/selections | D | Customer browser state |
| Promo/coupon definition | A | Settings → Coupon promotions |
| Promo code entered | D | Customer input |
| Discount eligibility/value | E | Server calculation |
| Subtotal | E | Server-authoritative product/modifier prices |
| Delivery fee | E | Server route distance + active delivery rule |
| Grand total | E | Server calculation |
| Browser total | E | Estimate only; never authoritative |

## Delivery and location

| Field | Class | Admin surface / owner |
|---|---:|---|
| Delivery city | A | Delivery settings |
| Canonical areas, aliases, grouping and order | A | Delivery → Areas |
| Restaurant origin coordinates | A | Delivery settings |
| Free-distance threshold | A | Delivery rules |
| Per-kilometre rate and rounding mode | A | Delivery rules |
| Customer GPS coordinates | D | Customer consent/device |
| Geoapify API key | C | Vercel/server environment |
| Reverse-geocoded address | E | Geoapify response |
| Canonical matched area | E | Sanitized location + active aliases |
| Route distance/duration | E | Geoapify routing |
| Location selector behavior/accuracy window | B | Application code |

## Checkout, customers and addresses

| Field | Class | Admin surface / owner |
|---|---:|---|
| Customer name, phone, email | D | Auth/profile/order submission |
| Saved address fields/coordinates | D | Authenticated customer-owned rows |
| Delivery instructions/landmark | D | Customer/order snapshot |
| Customer order count/total spend/last order | E | Aggregate over accessible orders |
| Admin customer notes (if added) | A | Customer detail; never auth secrets |
| Account password/OTP/session tokens | C | Supabase Auth; never visible to admin |

## Orders and tracking

| Field | Class | Admin surface / owner |
|---|---:|---|
| Order UUID | B | Database generated |
| Human-readable order number | B | Database/server generated |
| Order item/modifier price snapshots | E | Server calculation at creation |
| Order status | A | Authorized operational workflow |
| Status history timestamp/actor | B | Database/server trigger/command |
| Customer-visible current status | E | Latest persisted status |
| Payment method (`CASH_ON_DELIVERY`) | D | Customer selection from allowed methods |
| Payment status/reference | B | Server/payment workflow |
| Estimated preparation time | A | Order operations, if enabled |
| Live GPS courier tracking | B | Not supported in this phase |

## Authentication, staff and security

| Field | Class | Admin surface / owner |
|---|---:|---|
| Supabase project URL/publishable key | C | Deployment environment (public config) |
| Supabase service-role key | C | Privileged server environment only |
| Google OAuth provider secret | C | Supabase provider configuration |
| Customer identity/session | D | Supabase Auth |
| Staff membership | A | Owner-only Users & Roles |
| OWNER/MANAGER/STAFF role | A | Owner-authorized role assignment |
| Effective permissions | E | Membership + role/permission mapping |
| Route authorization | B | Server checks + RLS |
| Audit-log actor/action/entity/timestamp | B | Server/database |
| Audit-log safe metadata | E | Sanitized command context |

## Reviews and integrations

| Field | Class | Admin surface / owner |
|---|---:|---|
| Reviews section enabled/title/display name | A | Reviews / Integrations |
| Public EmbedSocial widget reference | A | Reviews / Integrations |
| Google place/business non-secret identifier | A/C | Admin metadata if public; env if operationally sensitive |
| Google Places API key | C | Server environment |
| Google Business OAuth credentials/token | C | Server environment |
| SociableKIT feed URL | C | Server environment |
| Rating/review count/review content | E | External provider response |
| Write/view Google URLs | E | Provider response/configured safe URL |

## Media and deployment

| Field | Class | Admin surface / owner |
|---|---:|---|
| Logo/banner/category/product media | A | Authorized uploads to scoped buckets |
| Storage object path/content type/size | B | Validated upload service |
| Public media URL | E | Storage path/public bucket configuration |
| API/provider credentials | C | Separate Vercel environment per app |
| Customer/admin deployment URLs | C | Vercel/Supabase redirect configuration |
| Cache tags/revalidation | B | Server data layer |

## Payment readiness

Real gateway credentials and transactions are outside this phase. Payment method/status/reference fields are system-owned contracts. `CASH_ON_DELIVERY` is the only enabled method; `ONLINE` and gateway settings remain disabled placeholders until a separate authorized integration phase.
