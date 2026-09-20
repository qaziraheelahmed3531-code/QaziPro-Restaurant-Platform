# Storefront production-finish verification — 8 September 2026

Status: implementation and substantial live QA completed; Google Maps configuration and business assets still prevent unconditional production sign-off.

## A. Google Maps

- COMPLETED: primary Admin area map, branch restaurant-location editor and customer checkout map use the shared Google Maps loader. Primary component source contains no Leaflet/OSM references.
- COMPLETED: one loader, loading/error/missing-key handling, click and draggable marker handlers, coordinate-driven recentering. Ordinary parent renders no longer reset the map view.
- TESTED in Chrome: Admin live autocomplete for **JFC Ghazi tarbela**, exact suggestion selection and Save.
- TESTED: authenticated Admin Text Search fallback resolves the same Google Place ID: `ChIJ2dynfAD_3jgROrGsE5z2Hw4`.
- TESTED in Chrome: customer live Hamlet autocomplete, exact place resolution, area validation and route quote.
- REQUIRES USER ENV CONFIG: `NEXT_PUBLIC_GOOGLE_MAPS_BROWSER_KEY` is missing in both `apps/customer/.env.local` and `apps/admin/.env.local`. It must be a dedicated browser-safe, HTTP-referrer-restricted key. Neither server key was promoted to a public variable.
- PROVIDER LIMITATION: direct Google Geocoding returned HTTP 200 / `REQUEST_DENIED`, not a usable address. Check the enabled API and server-key restrictions in Google Cloud. Customer uses the existing Geoapify reverse fallback. Admin's server-only Geoapify fallback has also been configured.
- BLOCKED: live Google map tiles, map clicks and marker dragging cannot be signed off without the browser key. Missing-key fallback was rendered in Chrome. Actual device GPS has not been tested; GPS/error/abort behavior has unit coverage.

Server-only `GOOGLE_PLACES_API_KEY` and `GEOAPIFY_API_KEY` were missing from Admin. The existing customer server keys were reused inside Admin's server environment, without printing their values.

Main files: `packages/shared/src/google-maps.ts`; both apps' `components/location-map.tsx` / `components/location/location-map.tsx`; `apps/admin/components/delivery-setup-wizard.tsx`; `apps/admin/app/api/delivery/google/route.ts`; customer location API routes, `lib/google-places.ts`, `lib/location/resolve-address.ts`, `lib/location/use-checkout-location.ts`; Admin branch page.

## B. Delivery origin and area consistency

- Root cause: the branch originally had no saved coordinates; customer env still contained the old origin **33.601365, 72.9816284**. Routing had competing origin sources.
- COMPLETED: valid branch DB coordinates are now authoritative. Old env/rule coordinates cannot override them. Legacy rule fields are database-derived mirrors and read-only in the fee editor.
- TESTED: saved JFC branch origin **34.013528, 72.652506**. Google's unrounded coordinates were **34.0135284, 72.6525055**. Address: **Main Ghazi Rd, Khalo, Pakistan**.
- TESTED destination: **34.0539699, 72.63729169999999**, real Google Hamlet result, canonical **Hamlet Colony**.
- TESTED provider quote: **7.2 km**, approximately **7 minutes**, **PKR 300**. It is no longer 83.4 km / PKR 7,900 for this test route.
- COMPLETED: UI reverse lookup, quote validation and order validation share the canonical coverage resolver. A different valid area requires an explicit switch; uncovered coordinates are rejected.
- TESTED: outside-service-area quote returned HTTP 422. Coverage units exercise polygons, holes, radii, locality matching and area mismatch.
- COMPLETED: Google physical locality is stored separately as `google_locality`; selecting Khalo no longer overwrites the operational service city Tarbela Ghazi.
- TESTED: numeric origin validation; no invalid existing branch origins found. The database coordinate constraint was validated.
- COMPLETED: origin/fee/coverage changes invalidate client quotes; stale quotes are cleared while recalculation runs.

The JFC origin was saved as explicitly requested for the test. Confirm this is the intended production restaurant origin before launch.

## C. Footer and CMS

- COMPLETED: compact dark footer with brand/tagline/contact area, Quick Links, Support and Order columns, today's configured hours, policies above a separate centered developer-credit line.
- TESTED in Chrome at **1440px and 390px**: no horizontal overflow, no page JavaScript errors, mobile accordion expansion works.
- COMPLETED: six standard social editor cards, real glyphs from `simple-icons`, enabled toggles, URL validation and ordering; WhatsApp international-number normalization.
- Root cause of missing icons: **no social-link rows were configured in the live database**.
- TESTED: six editor cards rendered; inactive empty social row saved; anonymous query cannot see it; enabling a blank destination was rejected by the database. Temporary fixture removed.
- TESTED unit checks: blank/unsafe links do not render; WhatsApp normalization works.
- PARTIAL: actual Facebook/Instagram/WhatsApp enable → visible → disable test requires the restaurant's real URLs. None were invented or published.
- COMPLETED: footer logo upload field, tagline/contact editing, grouped links and content-page editing. Optional App Store/Google Play destinations render only for valid configured store URLs.
- COMPLETED: customer content refresh subscribes to published content changes, with a visible-page reconciliation fallback. No redeployment is needed. Deactivation/unpublication may rely on reconciliation if RLS hides the updated row from anonymous realtime subscribers.
- TESTED: application-owned credit is exactly **Powered by QAZIRAHEELAHMAD**, links to `https://wa.me/923079963990`, opens a new tab, and has no CMS setting.
- REQUIRES BUSINESS INPUT: approved logo, restaurant phone/email, social destinations and optional app URLs. The current logo fallback is not an approved official logo. Existing AMS review test branding/content and seeded legal/contact copy should be approved before public launch.

Screenshots: `qa-footer-1440.png`, `qa-footer-390.png`, `qa-social-editor.png`, `qa-admin-location.png` in this directory.

## D. Database and permission fixes

TESTED/APPLIED, using Supabase CLI dry-run followed by push; no reset:

1. `202609080002_branding_footer_cms.sql`
2. `202609080003_fix_crypto_function_resolution.sql`
3. `202609080004_google_branch_locations.sql`
4. `202609080005_social_link_validation.sql`
5. `202609080006_origin_mirror_and_store_links.sql`
6. `202609080007_storefront_content_realtime.sql`
7. `202609080008_authorized_restaurant_origin.sql`
8. `202609080009_google_locality.sql`

Latest migration dry-run reports the remote database is up to date, with an empty pending list.

- TESTED live: `extensions.gen_random_bytes(16)` returns 16 bytes.
- TESTED live: **zero unqualified `gen_random_bytes`/`digest` calls** in public functions.
- Root cause discovered in real browser QA: Delivery staff saw a Save success although RLS updated zero branch rows.
- COMPLETED/TESTED: `save_restaurant_origin` is a narrow, permission-checked RPC. Delivery/branch managers may change location fields without arbitrary branch permissions. It returns the saved branch ID, so the UI cannot report a zero-row update as success. Anonymous mutation is denied.
- COMPLETED: unexpected database errors become friendly customer order errors; authorization hashes are stripped from customer order detail responses.

## E. Signed-in order E2E

TESTED by actual Chrome UI clicks, not just a build or direct RPC:

- Order **IP-20260908-000003** — ID `476976b0-d307-451b-b3f8-dc5bafb5b745`.
- Signed-in QA customer → location selection → Chicken Fajita Pizza customization (Medium / Regular) → checkout address autocomplete → COD Place Order → tracking.
- Database ownership matched the authenticated QA user before cleanup.
- Admin Orders showed the new order without manual refresh.
- Admin Confirm/Preparing actions were clicked; customer tracking reflected actual changes; order was visible in Kitchen with its item/customization data.
- 80mm and 58mm authoritative receipts rendered with token, items/options, customer phone, address, delivery note, totals and payment.
- Print Receipt loaded the latest order and invoked the browser adapter. **Print boundary was intercepted for testing; physical paper output/system printer dialog is NOT claimed tested.**

An additional API integration test, order **IP-20260908-000001**, verified authenticated realtime INSERT, unauthorized order denial, and tracking through OUT_FOR_DELIVERY. Customer cancellation was denied after Admin progression.

## F. Guest order E2E and cancellation

- TESTED actual **390px Chrome UI** guest checkout: **IP-20260908-000004**, ID `5948f4b0-7adc-4780-8665-b5b23d4ed77b`.
- No sign-in required. Server returned a high-entropy tracking token; it was not printed in reports.
- Database row, success navigation, Admin arrival without refresh, customer tracking, Confirm/Preparing, and Kitchen visibility passed.
- TESTED: cancellation control disappeared at the deadline; direct API cancellation after 60 seconds returned HTTP 409.
- TESTED: 80mm receipt in the guest flow; the remaining 58mm test was completed separately against the same real guest order after a development-navigation abort interrupted the first run.
- Additional guest API order **IP-20260908-000002** tested successful cancellation inside the allowed window and denied lookup without the guest token.

All four QA orders were clearly labelled **DO NOT FULFILL** and cancelled. Disposable QA accounts and inactive social fixtures were removed; original print width was restored. Cancelled orders/audit history were deliberately retained. Deleting the temporary auth fixtures can null their customer foreign keys; signed-in ownership was asserted before cleanup. No real customer order was changed.

## G. Builds and regression coverage

- TESTED: customer production build PASS.
- TESTED: Admin production build PASS; final rebuild is checked after the last small location-provenance edit.
- TESTED: backend TypeScript build PASS (no separate backend test script is defined).
- TESTED: customer/Admin lint.
- TESTED unit suites: actual coverage resolver, checkout asynchronous races, outside/mismatched locations, original-pin retention, quote integrity, GPS error/abort cleanup, overlay locks, sticky-navigation observer behavior and one-click/one-scroll behavior.
- COMPLETED: Admin topbar polling now pauses when the tab is hidden, refreshes on visibility return, polls notifications less aggressively, and ignores stale global-search responses. The Kitchen board likewise pauses background polling/ticking while hidden, reducing unnecessary network and render work without changing realtime behavior.
- Google OAuth, email OTP and physical device GPS were not re-exercised in this pass. The auth implementation was not replaced. A local-session logout isolation test passed using disposable authenticated fixtures.

## Remaining sign-off requirements

1. Set the dedicated `NEXT_PUBLIC_GOOGLE_MAPS_BROWSER_KEY` in both apps and configure allowed localhost/production referrers; then verify live tiles, pin dragging/clicking and GPS permissions. See Google's [loader guidance](https://developers.google.com/maps/documentation/javascript/load-maps-js-api).
2. Resolve Google Geocoding `REQUEST_DENIED` if Google reverse geocoding is required; Geoapify fallback remains available.
3. Supply/approve actual restaurant logo, contact details and social URLs; run the real enabled/disabled storefront test with those destinations.
4. Verify the configured physical thermal printer at both supported widths. No universal silent printing is promised.
5. Approve the saved JFC test origin and current public-facing review/legal/business content before deployment.
