# Restaurant Admin — verified continuation, 27 September 2026

This is a **partial delivery**, not an A-to-Z acceptance PASS. The loading, table-management and product-availability slice is implemented and locally verified. The larger request still has substantial implementation and public acceptance work below. No production changes, deployment, external emails or push messages were made.

## 1. AUDIT SUMMARY

Inspected the existing Admin routes, server loaders, canonical auth/branch helpers, table/database constraints, menu state, orders loading, report layout, messaging code and customer surface. Continued from `fcb86e247d798939e7d17d28911ad80d03964e40` on canonical `main`; origin/main matched before this commit. Unrelated Super Admin dependency and lockfile changes were preserved and excluded.

## 2. ROOT CAUSES FOUND

- One generic skeleton showed two large blocks regardless of the actual page. Reports need six metrics; products use category groups with image/details/actions; orders use a nine-column table that becomes cards on mobile.
- Orders' client fetch bypassed route skeletons and displayed only a spinner.
- Table mutations lacked reliable pending/error handling and duplicate-event guards. Failed reads could look like an empty floor; stale/no-row updates could appear successful.
- Quick availability fetched products a second time, flashed an empty state, and maintained a different stock state from product cards. It lacked duplicate-click protection and did not verify affected rows or storefront refresh success.
- Menu server queries converted errors to empty arrays. A polished loading state must end in a genuine error state, not a false empty menu.
- A later button CSS rule omitted transform from transitions, making hover movement abrupt.

## 3. CANONICAL TABLES / MODELS / APIs USED

- `restaurant_tables`, existing branch uniqueness and open-bill protections; `restaurant_table_sessions` remains unchanged.
- `products`, `categories`, `pos_sections`, `modifier_groups`; no alternative catalog.
- `requirePermission`, `getSelectedBranch`, existing authenticated Supabase clients and RLS.
- Existing `/api/revalidate-customer`; no new data or notification system.
- Next.js route `loading.tsx` and current-version error boundary `retry()` API.

## 4. UX / UI IMPROVEMENTS MADE

- Structural shimmer variants for dashboard/reports, orders, menu, tables and kitchen, plus generic fallback. Route boundaries and Orders client fetching use them.
- Shared layout classes retain metric columns, product imagery, filter areas and responsive table/card conventions. Placeholder counts are representative, not assertions about unseen data.
- One transform-based sweep per surface, no JS animation timers or extra data queries. Reduced-motion disables animation; forced-colors retains outlines. Decorative shapes are hidden from assistive technology; one named loading status, no fake focusable controls.
- Mobile, tablet and desktop screenshots inspected. Compacted mobile rows after visual review.
- Table creation/refresh/activation/deactivation have pending labels, touch-friendly controls, inline errors and deactivation confirmation.
- Retryable page error UI avoids exposing raw database diagnostics.
- Figma foundations were created from existing styles: [QaziPro Restaurant Admin — Operations Design System](https://www.figma.com/design/x7gcypEuQkCrHt8FlR4kaq). This is a foundations sheet (33 variables, three text styles, one effect), **not** a completed screen library or interactive prototype.

## 5. FEATURES FIXED / ADDED

- Table input validation mirrors existing database constraints. Ref-based guards prevent same-render duplicate actions. Updates include business, branch and expected status. A stale/no-row result is not treated as success. Branch changes remount local table state.
- Product availability uses already-loaded catalog data. Confirmed updates affect both quick tiles and product cards; fresh server snapshots supersede local confirmation patches. Updates include business, active-product and expected-state filters.
- Availability failures retain prior UI, committed changes are not falsely rolled back if revalidation fails, and customer-sync uncertainty is explicit.
- Menu loader failures throw to the retry boundary rather than presenting an empty editable catalog.

## 6. QR TABLE FLOW STATUS

NOT COMPLETE. Table CRUD safety is improved, but customer QR/table context, QR generation/printing, full-menu entry and cart/order propagation are not implemented or accepted in this slice. Customer code inspection did not establish an existing end-to-end table QR flow. Do not conflate waiter table RPCs with customer QR ordering.

## 7. REVIEW FLOW STATUS

NOT COMPLETE. Existing review-widget configuration is not evidence of verified-order feedback capture. Verified-order eligibility, anti-abuse handling and review moderation still need implementation/verification.

## 8. NOTIFICATION FLOW STATUS

NOT COMPLETE. No browser push delivery or notification-click journey was tested. Existing mobile push capabilities are not proof of a customer web-push subscription flow. Browser permission/subscription lifecycle and canonical send integration remain to be completed.

## 9. EMAIL FLOW STATUS

NOT ACCEPTED. Existing customer broadcast tables/SMTP sender were inspected, not replaced or invoked. Follow-up audit: creation idempotency, delivery-result persistence errors, and tenant-canonical deep links (existing global customer URL fallback) require closure. No automated test sent email. A consenting real staging inbox is required for eventual real-delivery acceptance.

## 10. AUTH / ACCESS STATUS

UNCHANGED / PUBLIC RETEST PENDING. Existing auth, membership, entitlement and branch permission paths remain in use. Real Google, eight-digit OTP, invitation, logout/session restore and recovery were not exercised in this slice. Do not mark these PASS from component tests.

## 11. SECURITY / RLS STATUS

No RLS, role, entitlement, database grant or auth bypass changes. Component tests assert tenant/branch/expected-state query filters and simulated denial responses. These are **not live database isolation tests**. No secrets were added to the change set; fixtures have synthetic IDs and no transport credentials. No full repository secret-scanner run is claimed.

## 12. FILES CHANGED

- `apps/admin/components/portal-skeleton.tsx`, `orders-manager.tsx`
- `apps/admin/app/portal-skeleton.css`, `client-portal.css`, `interaction-polish.css`, `layout.tsx`
- `apps/admin/app/(dashboard)/loading.tsx`, `error.tsx`
- `apps/admin/app/(dashboard)/{menu,orders,reports,tables,kitchen}/loading.tsx`
- `apps/admin/components/table-manager.tsx`, `apps/admin/lib/table-draft.ts`, tables `page.tsx`
- `apps/admin/components/product-availability.tsx`, `products-manager.tsx`, menu `page.tsx`
- `apps/admin/package.json`: named loading/table/availability test commands
- `apps/admin/scripts/test-{portal-skeleton,table-manager,product-availability}.mjs`
- `docs/restaurant-admin-design-state.json`, this report, `docs/qa/restaurant-admin-foundations/` screenshots

## 13. MIGRATIONS / DATA CHANGES

None. No remote database mutations and no production or staging data repair were performed.

## 14. TEST RESULTS

| Check | Result | Scope |
| --- | --- | --- |
| Admin ESLint | PASS | Full Admin workspace |
| Admin TypeScript `--noEmit` | PASS | Full Admin workspace |
| Admin optimized Next.js build | PASS | All Admin routes |
| `test:tables` | PASS, 17 checks | Real component; mocked database transport |
| `test:loading` | PASS, 10 checks | Seven variants at 360/768/1440px; animation movement, accessibility modes, completion, retry |
| `test:availability` | PASS, 9 checks | Actual menu + availability components; mocked transport and unrelated collection sorter |
| External requests/runtime errors in these browser suites | Zero | Isolated harnesses only |
| Public full E2E, live RLS, auth, QR, push/email delivery | NOT RUN | Not covered by the above PASS results |

Node emits a harmless module-type warning for the TypeScript table-draft import in its test harness; tests pass. No actual-app CLS/frame-rate benchmark or all-route layout-perfect claim is made.

Reproduce from repository root:

```powershell
npm run test:tables --workspace apps/admin
npm run test:loading --workspace apps/admin
npm run test:availability --workspace apps/admin
npm run lint --workspace apps/admin
npx tsc --project apps/admin/tsconfig.json --noEmit
npm run build --workspace apps/admin
```

## 15. STAGING URLs TESTED

None in this slice. Browser suites used isolated local DOM harnesses, not authenticated public deployments. Public artifact readiness is not asserted.

## 16. COMMIT SHA

See the delivery message or `git log -1 --oneline -- docs/restaurant-admin-polish-progress-20260927.md`. This report is included in the change's commit. No deployment/push is part of this delivery.

## 17. REMAINING BLOCKERS

- **Internal work still pending:** QR/table customer flow, verified reviews, browser push, email reliability/deep links, full menu edit/delete improvements, broader branches/settings/realtime/access audit and module-level responsive acceptance.
- **External acceptance inputs:** authenticated staging owner/staff/customer sessions, explicitly approved real test inbox and browser/device subscription, working provider configuration. Do not invent credentials or send synthetic QA mail.
- Public staging revalidation of deployed code and tenant/branch isolation still required. This is not an A-to-Z completion certificate.

## 18. NEXT MANUAL TESTS

1. On a confirmed staging artifact, throttle networking and navigate dashboard, menu, orders, tables, reports and kitchen. Verify skeleton-to-real-content alignment with actual tenant data.
2. Toggle a staging product's stock once; verify quick tile, product card and correct customer hostname agree. Simulate revalidation failure and confirm the saved/uncertain-sync distinction.
3. Create a staging table, test duplicate code, active-bill deactivation denial and branch switching; check access with unassigned staff and another restaurant.
4. After the outstanding features are implemented, run QR full-menu/cart/order, genuine-order feedback, approved real email and opted-in push delivery/click tests.
5. Rerun real Google/OTP/invitation/session/entitlement scenarios. Do not use component mocks as public acceptance evidence.
