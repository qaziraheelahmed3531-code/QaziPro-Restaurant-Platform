# Targeted Admin upgrade — implementation and QA

Date: 7 September 2026. Scope: the Media, category navigation, ordering, invoices, and staff-access upgrade. The platform was not rebuilt. No packages were installed.

Implementation is completed for the requested modules. Final acceptance is **PARTIALLY COMPLETE**: automated and live-service checks passed, but interactive browser acceptance, delivered-email onboarding, and physical printing have not been verified. They are not reported as successful.

## A. Media — COMPLETED; service tests TESTED; visual propagation pending

- Reusable component: `apps/admin/components/media-field.tsx`; validation: `apps/admin/lib/media.ts`.
- The existing authoritative fields use this component: product gallery, category image/section banner, deals, desktop/mobile hero, promotional banners, main/footer logo, favicon, and invoice/receipt logo.
- Buckets reused: `product-images`, `category-images`, `hero-banners`, `business-logos`. Authenticated uploads are scoped by business and exact permissions. The service-role key is not used by the browser.
- URL input, current-image preview, file picker/drop, uploading state, replace/remove, inline errors and retry are implemented. Removing an image clears the draft field; it does not delete a potentially shared Storage object.
- JPEG/PNG/WebP extension, MIME, 10 MB size and file-signature checks are tested. Safe HTTPS/CDN and local image paths are supported. SVG file uploads are intentionally disabled; existing safe SVG URLs remain usable.
- **TESTED against live Supabase:** authenticated product upload, public image retrieval, product-gallery URL persistence, category/banner/logo bucket uploads, unauthorized branding upload denial and denied cashier catalog writes. Temporary product content stayed inactive and invisible to customers.
- **PARTIALLY COMPLETE:** URL preview, replace/remove interaction, deal-specific visual rendering and changed-image propagation on the customer screen still require a browser. Uploading to a bucket is not claimed as equivalent to visual acceptance of every form.

## B. Category navigation — COMPLETED; unit regression TESTED

- `apps/customer/components/home/sticky-category-nav.tsx` provides the text-only row. Existing image category cards are unchanged.
- IntersectionObserver reveals the row only after the original rail passes above the header; cards below the viewport do not activate it. Returning to the cards hides it.
- Observers change visibility/active styling only. A tab click calls the existing central section-scroll helper once. Header plus compact-row height is included in the target offset.
- The mobile rail is single-line, horizontally scrollable, touch-friendly and reduced-motion aware. Active-tab centering calls only the rail's horizontal `scrollTo`.
- **TESTED:** the actual component/helper passed mocked regression checks for visibility, active-state updates, no observer-driven document scrolling, horizontal-only centering, single-click/single-scroll and return-up hiding.
- **BLOCKED — browser acceptance:** no connected browser was available through the Browser skill, including the final retry. Desktop and 390 × 844 touch/scroll/visual QA remain unverified.

## C. Sorting — COMPLETED; database persistence TESTED

- Sortable collections: categories, products within category, deals, hero banners, promotional banners, modifier groups, options within a group, social links, product gallery and product-to-modifier assignments.
- Existing Motion handles drag movement; explicit Save order, keyboard move buttons, optimistic ordering, rollback, stale-data detection and unsaved-change warnings are implemented.
- `content_order` returns the full collection; `reorder_content` validates the exact snapshot and atomically updates all positions under a business lock. It is not limited to the visible table page.
- Database tests verified saved order and rejection/rollback of a stale save. Customer image cards, compact tabs and category menu sections consume the same ordered source.
- A separate arbitrary homepage-layout editor was intentionally not added: existing global section layout has no safe configurable ordering model, as permitted by the brief.
- Customer requests already fetch uncached storefront data; new page requests do not require a server restart. The optional cross-app revalidation bridge still needs a matching customer-side `REVALIDATION_SECRET`. An already-open page is not live-pushed.
- Browser drag interaction and customer-side visual order propagation remain pending.

## D. Invoices — COMPLETED; accounting TESTED; printer acceptance pending

- Added `invoice_settings`, `invoices`, `invoice_lines`, and server-managed numbering. Reused and extended the existing payment/refund ledger instead of creating a second ledger.
- Invoices / Billing supports search/date/status filters, manual drafts, live preview, edit/finalize/void/reissue, order-derived invoices, received payments, paid/balance totals and configurable identity/logo/terms/footer.
- Order invoices use authoritative order items, modifiers and totals. Finalized accounting fields are protected. Paid invoices require refunds before voiding.
- Tested line/header discounts and taxes, integer-PKR rounding, unique numbering, draft retries, immutable finalization, partial payment/balance, cash and bank refunds, register reconciliation and order-ledger reuse.
- Fixed a reissue retry defect: replacement invoices no longer reuse the original draft's client reference; repeated manual reissue requests return the existing active replacement.
- Print layouts exist for A4, 80 mm and 58 mm. Admin chrome is excluded. The total remains emphasized when tax is hidden. Existing thermal receipt/token paths and `BrowserPrintAdapter` are preserved.
- Browser Print → Save as PDF is the baseline export. Thermal CSS fixes content width; paper dimensions must also be selected in the system/printer dialog. CSS does not accept mixed `80mm auto` page-size syntax, so thermal pages use the printer's selected size. [CSS Paged Media specification](https://www.w3.org/TR/css-page-3/#page-size-prop).
- **REQUIRES PRINTER HARDWARE:** real 58/80 mm output, driver margins, clipping, cutting and copies. A4/PDF browser rendering also remains unverified. No silent-printing claim is made.

## E. Staff access — COMPLETED; server/RLS and live routes TESTED

- Staff are added/edited by email; privileged lookup happens server-side. The business-facing table displays email/name, role, status, access and last sign-in, not Auth UUIDs.
- Normalized exact grants, role presets, global/group Select All and server/RLS enforcement are implemented. OWNER retains all access. Restricted users land on an available module after sign-in.
- Existing verified Auth emails resolve internally. New users have pending invitations, server-side sending/resending and verified-sign-in activation. Provider rejection is shown accurately, and provider acceptance is not represented as inbox delivery. [Supabase invitation API](https://supabase.com/docs/reference/javascript/auth-admin-inviteuserbyemail).
- **TESTED locally:** verified/unverified invitation activation, exact grants, escalation denial, audits and last-owner protection. Concurrent owner demotion permits only one of two competing removals.
- **TESTED live:** a products-only Manager could access Products but not Categories, Payments, Staff, Settings or Invoices; staff API escalation was denied. An exact Cashier could access POS, Orders and Receipts but not Menu, Payments, Reports, Staff or full Register. Updated grants took effect without another sign-in. Anonymous protected pages redirected.
- The live Auth health probe and temporary-account sign-ins passed. An early failing fixture was corrected; there is no outstanding Auth creation failure from the final tests.
- Existing active OWNER membership count and fingerprint were unchanged before/after QA.
- **REQUIRES SMTP / onboarding acceptance:** delivery to a real test inbox, resend and full invited-employee browser onboarding are not tested. Confirm Supabase SMTP and allowed redirects for the deployed Admin URL. Local `ADMIN_APP_URL` is set to `http://localhost:3001`; replace it for deployment.

## F. Builds, migrations and cleanup — TESTED

| Check | Result |
| --- | --- |
| Customer production build | PASS |
| Admin production build | PASS |
| Backend TypeScript build | PASS |
| Customer and Admin lint | PASS |
| Media/invoice helper tests | PASS |
| Sticky navigation unit tests | PASS |
| SQL targeted-upgrade tests | PASS |
| Invoice/order/payment regression | PASS |
| Existing POS/Kitchen/stock/refund/report regressions | PASS |
| Existing website-order/delivery/modifier/tracking regression | PASS |
| Concurrent last-owner changes and 20 invoice-number allocations | PASS |
| Live restricted HTTP routes and Storage tests | PASS |

Versioned migrations `202609060010` through `202609060013` and `202609070001` are deployed to the linked Supabase project. Earlier migrations were preserved. Fresh isolated PostgreSQL replay plus seeded regression tests passed; no POS sales or invoices were created in the live business for accounting QA.

Live cleanup verification found zero temporary Auth users, products or Storage objects. Immutable QA audit history is retained. Existing owner access and user development servers were preserved.

Test sources: `apps/admin/scripts/test-targeted-helpers.mjs`, `test-targeted-live.mjs`, `test-targeted-concurrency.mjs`; `apps/customer/scripts/test-sticky-navigation.mjs`; and `supabase/tests/{targeted-upgrades,invoice-order-regression,operations,online-order}.sql`. SQL/concurrency tests require a fresh isolated database; never run their fixtures against production.

Remaining acceptance: connect a browser for desktop/mobile and print-preview QA; provide a real staff test inbox and verify SMTP/redirects; test both thermal printers. Customer OAuth, live Geoapify interaction and third-party review widgets were not changed or represented as newly end-to-end tested.
