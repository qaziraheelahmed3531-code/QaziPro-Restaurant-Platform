# Leaflet + Geoapify location pass — 9 September 2026

## A — Environment

Server geocoding/routing uses `GEOAPIFY_API_KEY`. Browser tiles use only `NEXT_PUBLIC_GEOAPIFY_MAPS_KEY`; the existing Admin public tile key was reused in Customer. No server key was made public or printed. Both example files include the public variable name.

**BLOCKED:** Geoapify returns HTTP 401 with `Invalid apiKey` for the configured public key on actual high-zoom tile requests, with and without localhost referrers. Chrome reports `ERR_BLOCKED_BY_ORB` because the tile response is JSON, not an image. An initial low-zoom request returned 200; that did not establish the key's validity. Check/replace the public tile key in Geoapify and configure allowed origins. No restrictions were bypassed.

## B — Admin

Implemented one shared, browser-lazy Leaflet picker: Geoapify osm-bright/retina tiles, attribution, responsive heights, click, drag-end, programmatic recenter, radius display, scroll-safe default and explicit mobile pan control. Google Maps JS is no longer used by primary map components.

Admin search and forward fallback use Geoapify; stale requests are aborted. Technical country/locality/state fields are collapsed under Advanced details. Existing delivery-area editors remain below the restaurant card.

TESTED in Chrome: map initializes; click and drag-end invoke reverse geocoding; simulated GPS updates the pin/address. Physical device GPS not tested. Visible tiles are blocked by the public-key response above.

TESTED provider search: `JFC Ghazi tarbela` autocomplete returns nearby Tarbela places, not exact JFC; forward search returns zero candidates. No replacement business was invented. Existing restaurant origin preserved.

Applied migration `202609090001_geoapify_location_metadata.sql` after dry-run: provider-neutral reference/name/locality fields and permission-checked origin RPC. Geoapify references are not stored as Google Place IDs. Save/reload through the new Admin UI has not been runtime-verified; no simulated GPS was saved as the real origin.

## C — Checkout

Implemented compact area context instead of duplicate City/Area fields, address search, current location, shared map, selected address, Home/Work/Other and Save. Extra delivery fields remain collapsed. Valid configured-area changes automatically reconcile the header; outside pins clear the valid quote and block ordering.

TESTED at 390px using a cart fixture (not an ordering E2E): simulated GPS, reverse address, live route, guest current-order address save, outside-area error and disabled Place Order. Signed-in address POST/GET persistence tested with a disposable user and removed afterward. Save now waits for a successful server response and retains the real row ID.

Customer map click/drag and saved-address selection/recenter are implemented but not separately browser-verified. Shared Admin click/drag and checkout hook coverage tests passed. Guest addresses are current-session state, not promised permanent storage. Google Auth, Google Reviews and order/KDS/receipt pipeline were not changed.

## D — Delivery

TESTED live checkout route:

- Authoritative DB origin: `34.013528, 72.652506`.
- Destination: `34.0539699, 72.6372917` (Hamlet).
- Geoapify result: **7.2 km / 7 minutes / PKR 300**.
- Not the old 83.4 km / PKR 7,900 result.
- Islamabad outside pin returns no matched area; browser blocks Place Order.

Coverage/race tests passed: polygons, radii, locality precedence, original exact pin, stale request suppression, automatic valid area change, outside rejection before order RPC, server-recomputed route, GPS cleanup.

## E — Validation

Customer production build PASS. Admin production build PASS. Backend TypeScript build PASS. Customer/Admin lint PASS. Location unit suite PASS.

Screenshots: `qa-leaflet-admin.png`, `qa-leaflet-checkout-390.png` show the actual key-blocked tile state, not mocked successful tiles. QA accounts/addresses were temporary; no new orders created. Full map sign-off remains blocked on a valid public tile key.

Implementation references: [Leaflet reference](https://leafletjs.com/reference), [Geoapify tile documentation](https://apidocs.geoapify.com/docs/maps/).
