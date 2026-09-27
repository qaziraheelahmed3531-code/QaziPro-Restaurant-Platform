# Customer layout delta — 28 September 2026

## Requested screenshot correction: PASS

The latest user instruction supersedes the previous request for a visible restaurant-introduction/kinetic-headline block. Removed the entire block from “Premium pizza…” through “Explore the menu”, including the duplicate name/location/status and its loading placeholder. Restaurant identity remains in the header, metadata and an accessible, visually hidden H1.

- Header and hero meet without an external gap on public mobile and desktop.
- Banner uses a stable 3.2:1 container and cover fit, eliminating the grey letterbox bands in the supplied screenshot. It uses the existing canonical restaurant images; no new imagery, offers or claims were invented. Differently proportioned uploaded artwork may crop with cover fit.
- Menu follows the hero directly, with 24px internal section spacing rather than the former large spacer/intro block.
- Initial skeleton no longer reserves the removed intro or an initially invisible sticky category rail. Header/hero geometry was aligned with the rendered layout.
- Removed the obsolete GSAP intro target. Existing carousel, cart, scroll and reduced-motion behavior remains.
- One responsive product tree replaces duplicate desktop/mobile React trees.

## Deployment

- Commit: `0a4d4cae208d91a109d45c14419b7530ce68f98a`
- Pushed to `origin/main`.
- Existing project: `qazipro-restaurant-customer-staging`, root `apps/customer`.
- Deployment: `dpl_7AnQfRCmTjUUwdfQLzcK32HE8hpM`, **READY**, matching commit verified.
- Public URL: https://italian-pizza.staging.qazipro.com/
- No new project, DNS change, production data change or new migration.
- Unrelated working-tree edits were preserved and excluded from this commit.

## Verification

- Customer ESLint: PASS.
- Customer unit tests: 12 passed, 0 failed.
- Customer optimized build and TypeScript: PASS. Subsequent small removal of the unused GSAP target and skeleton adjustments also passed the deployed build.
- Local Playwright responsive checks: 24 passed, 0 failed, widths 360/390/430/768/1024/1440/1920. Includes removal/spacing assertions, single product tree, product-to-cart, quantity, Escape, mobile cart reopening and reduced-motion carousel.
- Public HTTPS checks: 14 passed, 0 failed. Italian Pizza and Kings Cafe identities, alternating hosts, Italian Pizza mobile/desktop spacing and cart, private tenant-scoped reviews API, unknown-host denial, Admin login primary UI.
- Kings Cafe product/cart acceptance: **NOT TESTED**; no available product fixture. Do not count it as a passing commerce flow.
- Public QR browser checks: 5 passed, 0 failed. Table/menu resolution, checkout context and reload persistence, cross-host/invalid token rejection, deactivation and explicit reset. Temporary staging table removed in cleanup. No real order or email sent.
- Public mobile screenshot visually inspected after dismissing the location selector.
- No browser runtime exceptions in those suites; no error/warning console messages in the inspected DevTools navigation.

## Performance measurements

Chrome DevTools lab traces of the public Italian Pizza homepage, not field percentiles:

| Viewport / conditions | LCP | CLS | TTFB |
| --- | --- | --- | --- |
| Desktop 1440×960, CPU 1×, unthrottled network | 1,884ms | 0.00 | 134ms |
| Mobile 390×844, CPU 4×, Fast 4G | 3,220ms | 0.00 | 158ms |

These were reloads in an existing isolated browser context. Initial location selection can appear; they do not establish complete menu/cart/checkout interaction performance. No field CrUX data or valid INP result was available. Mobile LCP remains above the 2.5s target. The first category banner was identified as a late/lazy LCP candidate on desktop; further profiling remains warranted. No blanket Core Web Vitals PASS.

## Full connected master gate: PARTIAL, not closed

This screenshot/layout correction is deployed and verified. It is not evidence that every item in the larger master task is complete. Previously identified outstanding acceptance requirements remain:

1. Manual real Google and eight-digit OTP login, delivery, restore/logout and unauthorized-account acceptance. No password or OTP was requested or captured.
2. Actual browser push delivery/click acceptance and backend worker execution/configuration. The earlier environment inspection found missing customer Web Push configuration; no delivery success is claimed.
3. Real Admin messaging SMTP configuration/delivery acceptance. This is separate from Supabase Auth email delivery. The approved inbox is restricted to Restaurant Admin acceptance.
4. Real order creation through Admin/POS/KDS and completed-order review acceptance. QR browser checkout interception does not prove operational ingestion.
5. Full authenticated cross-platform mutation matrix, including entitlement/lifecycle toggles and live data propagation.
6. Kings Cafe usable catalog fixtures, actual restaurant photography/logo content and the remaining mobile performance/accessibility review. Existing illustration placeholders are not claimed to be finished premium photography.
7. Follow-up security/reliability review of unsubscribing when a storefront is inactive, email branch scoping and provider-accepted/database-checkpoint failure recovery. These were identified as remaining review items, not verified fixes.

The skills used for this delta kept identity/accessibility intact, removed obsolete animation work, preserved responsive image sizing and required verification against the existing staging deployment.
