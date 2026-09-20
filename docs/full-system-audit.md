# Italian Pizza — Full System Audit

Audit date: 2026-09-05  
Repository: `D:\WebProjects\ITALIAN-PIZZA`

## Executive summary

The repository currently contains one implemented application: `apps/customer`. `apps/admin` exists but is empty, `apps/backend` does not exist, and `packages/shared` plus root `docs` were empty before this audit. The customer application is a Next.js 16.3.4 App Router project with a stable production build, a polished responsive ordering UI, Supabase Auth, server-proxied Geoapify integration, Google Places metadata, and an EmbedSocial reviews widget.

The customer experience is not yet backed by restaurant data persistence. Menu content, branding, delivery rules, supported areas, product modifiers, promotions, cart state, saved addresses, and orders are either static TypeScript data or browser `localStorage`. Supabase is used only for authentication/session management. A production migration must preserve the UI while progressively replacing these sources with PostgreSQL-backed reads and server-authoritative writes.

## 1. Current routes

| Route | Rendering | Purpose | Current data source |
|---|---|---|---|
| `/` | Static shell + client interactions | Homepage, hero, categories, search, menu | TypeScript demo data |
| `/cart` | Static transition route | Opens global cart drawer then returns home | React context/localStorage |
| `/checkout` | Static shell + client form | Delivery/pickup checkout | React context/localStorage/Geoapify |
| `/orders` | Static shell + client data | Browser-local order history | localStorage |
| `/orders/[id]` | Dynamic path UI | Browser-local order tracking | localStorage |
| `/account` | Dynamic server auth read | Google/email OTP account | Supabase Auth + local order/address counts |
| `/auth/callback` | Route handler | OAuth code exchange | Supabase Auth |
| `/api/location/autocomplete` | Route handler | Address suggestions | Geoapify server API |
| `/api/location/reverse` | Route handler | Reverse geocoding + area match | Geoapify + static area aliases |
| `/api/location/route` | Route handler | Driving route + fee | Geoapify + static fee constants |
| `/api/google-reviews` | Route handler | Rating, review links, review fallbacks | Google Places/legacy/SociableKIT |

There are no customer order, address, menu, branding, banner, or admin APIs yet.

## 2. Current reusable components

- Layout: `SiteHeader`, `SiteFooter`, `MobileBottomNav`.
- Providers/overlays: `AppProvider`, `AppOverlays`.
- Home: `HeroCarousel`, `CategoryTiles`, `MenuSearch`, `CategoryMenuSection`, `HomeHashScroller`.
- Commerce: `ProductCard`, `DealCard`, `CustomizationDialog`, `CartDrawer`, `CartItem`, `QuantityControl`, `PriceSummary`, `CheckoutPage`.
- Location: `LocationDialog`, `OrderTypeToggle`, reusable `BrandLogo`.
- Account: Google OAuth, email OTP, OTP verification, authenticated profile.
- Orders: order list and status-tracking presentation.
- Reviews: Google metadata section and EmbedSocial widget.
- Shared primitives: shadcn-style `Button`; most remaining form controls are local semantic HTML/CSS patterns.

## 3. Current data sources

| Source | Data |
|---|---|
| `data/demo-menu.ts` | Six products, three deals, pizza sizes, crusts, extras |
| `data/menu-sections.ts` | Eight visible menu/category sections |
| `data/hero-slides.ts` | Four placeholder hero slides |
| `data/tarbela-ghazi-areas.ts` | Canonical delivery areas, aliases, grouping, deterministic matcher |
| `config/location-config.ts` | Brand fallback, fixed delivery city, one pickup location |
| React context/reducer | Cart, location, quote, saved-address and overlay state |
| Browser localStorage | Cart/location/address state and locally created orders |
| Supabase Auth | Google OAuth, email OTP, cookie-backed session |
| Geoapify | Autocomplete, reverse geocode, driving routes |
| Google Places / EmbedSocial | Rating metadata, Google links, embedded review comments |

## 4. Hardcoded restaurant data

- Restaurant/display name and `IP` mark in header, footer, account and fallback configuration.
- Fixed city `Tarbela Ghazi` in state types, provider, checkout, autocomplete and location config.
- One pickup label: `Italian Pizza — Tarbela Ghazi`.
- Hero slide image paths and alt text.
- Category names, descriptions, images and ordering.
- Product/deal names, descriptions, prices, images, availability and badges.
- Pizza modifier groups/options and price adjustments.
- Free delivery threshold `5 km` and additional rate `PKR 100/km`.
- Promo code `PIZZA200` and fixed discount calculation.
- Footer description/social labels without managed URLs.
- Reviews currently target temporary AMS business configuration and a fixed EmbedSocial widget reference.

## 5. localStorage-backed data

`italian-pizza-demo-state-v2` stores cart lines, delivery/pickup mode, fixed city, selected area, coordinates, cached delivery quote, saved addresses, active address and promo code.

`italian-pizza-local-orders-v1` stores order payloads, browser-generated order IDs, status and totals. These totals are client-calculated and therefore not authoritative or payment-safe.

`italian-pizza-pending-home-section` is short-lived `sessionStorage` navigation state, not business persistence.

## 6. Environment-backed settings

Public browser configuration:

- `NEXT_PUBLIC_SUPABASE_URL`
- `NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY`

Server-only configuration:

- `GEOAPIFY_API_KEY`
- `ITALIAN_PIZZA_LAT`
- `ITALIAN_PIZZA_LON`
- `GOOGLE_PLACES_API_KEY`
- `GOOGLE_PLACES_PLACE_ID`
- `GOOGLE_BUSINESS_CLIENT_ID`
- `GOOGLE_BUSINESS_CLIENT_SECRET`
- `GOOGLE_BUSINESS_OAUTH_REFRESH_TOKEN`
- `GOOGLE_BUSINESS_ACCOUNT_ID`
- `GOOGLE_BUSINESS_LOCATION_ID`
- `GOOGLE_BUSINESS_REVIEW_URL`
- `SOCIABLEKIT_GOOGLE_REVIEWS_FEED_URL`

No service-role key is currently present in the customer application. Secret Geoapify and Google credentials are only read by server modules.

## 7. Demo/static menu data

The menu is fully static. Search creates a module-level index from demo products/deals. Category sections filter the static product array. Customization is pizza-specific and uses three hardcoded groups. Product cards pass client prices directly into cart lines. Hero banners and category artwork use local placeholders. No database IDs or durable version snapshots exist.

## 8. Backend-ready functionality

- Supabase SSR/browser clients and proxy-based session refresh are correctly separated.
- OAuth callback restricts redirects to internal paths.
- Geoapify API keys remain server-side; route inputs validate coordinate ranges.
- Deterministic area normalization/matching is isolated and testable.
- Location state already has canonical area IDs and coordinate support.
- Cart lines retain product IDs and selected option labels.
- Order tracking UI supports a controlled status progression.
- Customer-facing components are sufficiently separated to accept data props without visual rewrites.
- Body scroll locking supports multiple overlays and cleanup.

## 9. Functionality requiring persistence

- Business profile, branding, hours, branches and operational closure.
- Categories, products, images, variants, modifier groups/options and assignments.
- Deals, deal items, hero/promotional banners and sort ordering.
- Delivery areas/aliases, origin and delivery calculation rules.
- Customer profiles and saved addresses.
- Server-created orders, line snapshots, modifier snapshots, totals and status history.
- Staff memberships, roles, permissions and audit logs.
- Non-secret review presentation settings and public widget reference.
- Admin-controlled social links/site settings.
- Media metadata and storage lifecycle.

Cart persistence may remain browser-local initially, but order submission must resolve product/modifier IDs against authoritative database rows and recalculate all money server-side.

## 10. Customer authentication architecture

The app uses Supabase Auth with `@supabase/ssr`. Google OAuth begins in the browser and returns to `/auth/callback`, where the authorization code is exchanged server-side. Email OTP now uses the shared eight-digit token configuration for Customer and Admin. The root Next.js proxy refreshes/validates session claims. `/account` verifies the user server-side and listens for client auth changes.

Authentication currently grants no application role. An authenticated customer is not an administrator. Production administration must require a database staff membership checked server-side and enforced again by RLS.

## 11. External integrations

- Supabase Auth: active; PostgreSQL/Storage not yet used by application data.
- Geoapify: server-proxied autocomplete, reverse geocoding and routing.
- Browser Geolocation: explicit high-accuracy request with short improvement watch and cleanup.
- Google Places API (New): business/rating/review-link data with legacy fallback code.
- Google Business Profile OAuth: code exists but location ID may be unset.
- SociableKIT: optional server review feed fallback.
- EmbedSocial: public widget script/reference for review comments.
- Motion: restrained UI transitions with reduced-motion handling.

## 12. Technical debt

- No root workspace package manager configuration; each future app would otherwise duplicate installs/scripts.
- `apps/admin` is empty and `apps/backend` is absent.
- Shared types/business rules live inside the customer app.
- Customer page components import static data directly, preventing server data injection.
- Customization schema is pizza-specific.
- Checkout performs no robust server validation and stores orders synchronously in localStorage.
- Cart lines store option labels, not modifier option IDs and authoritative price snapshots.
- Promo code logic is hardcoded and client-authoritative.
- Business name/city/branch strings are duplicated across components.
- Review integration contains temporary AMS-specific naming/configuration.
- No generated database types, validation schemas, automated test suite, error boundaries for data outages, or observability.
- The Git repository currently reports the application tree as untracked, so there is no usable change history/baseline.

## 13. Duplicate data

- Restaurant name and pickup label appear in header, footer, account, checkout, orders and location configuration.
- Fixed city appears in types, provider, checkout, autocomplete and config.
- Product/menu knowledge is duplicated between menu rendering, search indexing and customization.
- Delivery values appear in constants and customer copy.
- Google review business identity appears in multiple Google Places/Business/UI modules.
- Order status labels/types are local to order modules rather than shared contracts.

## 14. Security concerns

- Client-generated orders and totals can be tampered with and must never be treated as authoritative.
- There is no staff authorization model or protected admin surface.
- There are no RLS policies because application tables do not exist yet.
- Customer profile/address ownership is not represented in PostgreSQL.
- Media upload authorization and MIME/size validation do not exist.
- Public review/widget identifiers are mixed with secret integration configuration and need explicit classification.
- Development diagnostics include location coordinates; they are appropriately development-only but must remain absent from production responses/logging policy.
- Rate limiting/abuse protection is not implemented for order creation or location proxy routes.
- A Supabase service-role secret must never be exposed to either browser bundle; privileged server use should be narrowly scoped if introduced.

## 15. Admin-controllable fields required

Admin control is required for business identity/contact details, safe brand colors, logo/favicon/footer identity, hours/temporary closure, branches, categories, products, media, modifiers, deals, banners, delivery areas/aliases/rules/origin, product availability, order status, staff membership/roles, non-secret review presentation, social links and setup completion. The complete classification is in `docs/admin-control-matrix.md`.

## 16. Proposed migration strategy

1. Establish root workspace scripts and a dependency-light shared package containing contracts, enums, validators and money/delivery helpers.
2. Add versioned Supabase SQL migrations with normalized tables, triggers, indexes, RLS, storage policies and idempotent demo seed data.
3. Build server-only repository/services against the Supabase publishable session client for user operations and a narrowly scoped secret client for trusted admin/server operations only where RLS cannot express the operation.
4. Build the admin app with server-side staff authorization before exposing CRUD routes.
5. Connect business/branding, categories, menu, modifiers, banners and delivery configuration to the customer through fallback-aware server loaders. Preserve current static data as temporary resilience during rollout.
6. Change cart/customization payloads to stable product, variant and modifier IDs.
7. Add a server order command that validates availability, recalculates prices/discount/delivery, inserts the order graph atomically and returns the generated order number.
8. Migrate authenticated addresses and order history to Supabase. Keep local cart/location convenience state non-authoritative.
9. Add targeted integration/security tests, build both apps, and document separate Vercel projects and Supabase manual steps.
10. Keep online payment fields and webhook boundaries ready, but enable only cash on delivery.

## Preserved behavior requirements

The migration must preserve the current visual design, Google/email authentication, Geoapify server boundary, Hamlet-to-Hamlet Colony matching, manual area selection, location scroll-lock cleanup, Google Places metadata and EmbedSocial rendering. Database outages must fall back gracefully and must not crash the customer storefront.
