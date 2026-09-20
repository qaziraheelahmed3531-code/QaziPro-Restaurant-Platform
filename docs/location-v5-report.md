# Location & Checkout Map V5

Scope: customer location/delivery-address flow and Admin delivery coverage only. Existing authentication, menu, reviews, POS, KDS and financial workflows were retained.

## A. Location modal

- 600px maximum-width desktop panel, full-width mobile bottom sheet, 16px mobile body padding and viewport-bounded height. The searchable list has bounded scrolling; very short viewports retain overflow access.
- Admin-controlled compact logo, “Select your order type”, Delivery/Pickup, current-location action, fixed read-only “Tarbela Ghazi”, searchable Area/Sub Region and Select.
- Selection is a draft until Select. Manual area changes clear old coordinates and quotes. Closing does not commit the draft. Header/cart/checkout share AppProvider state.
- The live database contains 82 active areas. Empty active lists and configured database outages no longer expose hardcoded demo coverage.
- Fresh GPS and bounded best-accuracy watcher cleanup are unit tested. Actual phone GPS/permission prompts still require device acceptance.

Files: apps/customer/components/location/location-dialog.tsx; apps/customer/app/location-v5.css; apps/customer/components/providers/{app-provider,app-overlays}.tsx; apps/customer/lib/storefront/server.ts.

## B. Area detection

- Configured Polygon/MultiPolygon containment first, including holes; configured radius second. A centre alone never authorizes a nearest-area match.
- Only LOCALITY_MATCH areas can use text fallback. An explicit polygon/radius miss cannot be overridden by that area's alias.
- Specific neighbourhood/suburb/locality fields outrank parent municipalities and generic Ghazi. Unicode normalization and database aliases are reused.
- Hamlet versus Ghazi and Hamlet versus Topi Tehsil are regression tested. A genuinely more specific suburb, such as TMS Colony inside the provider's Hamlet Colony result, retains priority.
- Requested coordinates are preserved; reverse-geocoder centroids no longer move the customer's pin.
- Production responses omit development diagnostics; exact-location console logging was removed.
- Live configuration: 0 polygon areas, 0 radius areas, 82 locality-match areas. No boundaries or centres were fabricated. Owner-supplied geometry is needed for geographically strict coverage independent of provider locality data.
- Final live provider check: Hamlet autocomplete returned 2 results; the Hamlet result reverse-resolved to hamlet-colony with coordinates unchanged. Islamabad reverse lookup returned no supported area and its quote request was rejected with HTTP 422. This is provider/API evidence, not a real-device GPS test.

Files: packages/shared/src/location.ts; apps/customer/data/tarbela-ghazi-areas.ts; apps/customer/lib/geoapify/reverse-geocode.ts; apps/customer/lib/location/validate-delivery.ts.

## C. Admin

- Existing Delivery Areas editor supports names, slugs, aliases, active state, sort order, coverage method, centre latitude/longitude, radius in metres and advanced GeoJSON.
- Map click sets the centre and previews a configured radius. Invalid coordinate pairs, radii and malformed/unclosed polygons are rejected.
- Reused drag ordering and keyboard controls, explicit Save, full-collection loading, branch scope, permissions, stale-save rejection and atomic persistence.
- Additive migration 202609070002_location_coverage.sql is deployed to linked Supabase. Earlier migrations, live coverage values and restaurant origin were not overwritten.
- Isolated PostgreSQL tests cover migration replay, geometry constraints, full-area reorder, branch isolation, cashier denial and transactional location-source persistence.

Files: apps/admin/lib/resources.ts; apps/admin/components/{resource-manager,collection-order,location-map}.tsx; supabase/migrations/202609070002_location_coverage.sql.

## D. Checkout map

- Leaflet 1.9.4 is the sole new mapping library, loaded only in the browser. Checkout map height: 260px.
- Wheel zoom is disabled. Move map / pin enables dragging; Done restores normal touch scrolling. Map click, draggable marker and keyboard-accessible Use map centre are implemented.
- Autocomplete starts at 3 characters after 380ms, with cancellation and stale-response protection. Bias uses the selected area's configured centre, then branch origin; country filter is Pakistan.
- Live testing found that appending the combined city/area label suppressed Hamlet results. Search now uses entered text and geographic bias separately. [Geoapify autocomplete documentation](https://apidocs.geoapify.com/docs/geocoding/address-autocomplete/).
- Suggestion → pin; pin → reverse-filled address; GPS → pin; saved coordinates → revalidated pin. Legacy coordinate-free addresses attempt lookup and otherwise require selection, never a guessed delivery pin.
- Different detected areas require explicit Switch confirmation. Outside/unverified pins disable Place order. Failed/over-distance quotes display an error and retry.
- Server handling verifies active branch/area, coordinates, coverage and area consistency, then recomputes driving distance. Existing authoritative fee/price rules remain unchanged. Browser fees/distances/labels are not trusted.
- GPS, AUTOCOMPLETE, MAP_PIN, SAVED_ADDRESS and MANUAL_AREA provenance is retained in shared state and address/order data as appropriate.

Files: apps/customer/components/checkout/checkout-page.tsx; apps/customer/components/location/location-map.tsx; apps/customer/lib/location/{api,use-address-autocomplete,use-checkout-location,validate-delivery}.ts; apps/customer/lib/geoapify/{autocomplete,client}.ts; apps/customer/app/api/location/{autocomplete,reverse,route}/route.ts; apps/customer/app/api/addresses/route.ts; apps/customer/lib/orders/server.ts; apps/customer/types/index.ts.

## E. Security and configuration

- Geoapify keys remain server-side. No .env.local files were changed and no credentials were printed.
- Final Customer/Admin static JavaScript/JSON bundle scans found no configured Geoapify or Supabase service-role secrets.
- Default OSM HTTPS tiles have visible attribution and normal browser caching/referrer behavior. No offline downloading, tile prefetching or tile proxy was added.
- NEXT_PUBLIC_MAP_TILE_URL optionally selects another compatible raster endpoint. It is PUBLIC configuration: never put a secret key there. A replacement provider may require additional attribution and a browser-restricted public credential.
- OSM's public tiles are best-effort, not an SLA-backed production contract. Confirm a suitable provider before significant production traffic. [OSM tile policy](https://operations.osmfoundation.org/policies/tiles/).
- Business approval required: the existing dispatch origin produced Rs 7,900 for a public Hamlet Colony search point and Rs 8,400 for another Hamlet point. The formula was not changed. Confirm the actual restaurant dispatch pin and maximum delivery distance before launch.

## F. Regression and acceptance

Passed:

- Actual-source geometry/alias/reverse-geocoding/server-order tests.
- Checkout hook cross-area confirmation, stale requests, outside rejection and legacy address fallback.
- AppProvider reducer pin/quote invalidation, persisted-quote recheck, source tracking and cart preservation.
- Fresh GPS, bounded watch timeout/abort/permission cleanup and nested body-lock release tests.
- Existing OTP/OAuth call-contract tests (mocked, not interactive sign-in), sticky navigation and media/invoice helper tests.
- Fresh isolated SQL replay and location-v5, operations, online-order, targeted-upgrades and invoice-order-regression suites.
- Read-only live Supabase coverage/location endpoint checks and customer homepage/checkout/cart/account/orders HTTP responses.

Not claimed:

- Actual device GPS at the user's location; visual desktop/390px acceptance; touch dragging/scroll interaction; signed-in saved-address UI acceptance.
- Browser skill discovery returned no available browser. Interactive checks require a connected browser; unit/HTTP tests are not visual QA.
- No live test orders were created. Financial/order fixtures ran only in an isolated database and rolled back.
- Temporary QA server/database processes were stopped; the disposable local QA cluster was removed. It can be recreated from the workspace migrations, seed and tests. Existing user development servers on 3000/3001 were left running.

Tests: apps/customer/scripts/test-location-v5.mjs; apps/customer/scripts/check-location-v5-live.mjs; supabase/tests/location-v5.sql. Never run SQL fixtures against production.

## G. Builds

Customer, Admin and Backend production builds: PASS. Customer and Admin lint: PASS.

Remaining launch acceptance: confirmed restaurant origin, approved coverage geometry, suitable tile service and connected-browser/device QA.
