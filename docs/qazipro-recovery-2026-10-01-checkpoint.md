# QaziPro recovery checkpoint — 2026-10-01

## Urgent Staff & Roles issue: fixed on staging

The deployed `save_staff_by_email_v2` email regex contained a double-escaped dot. A normal email failed its PostgreSQL validation. The editor displayed the resulting error behind its modal, making Save appear ineffective.

- Replaced the regex with a literal-dot character class; reject null/whitespace-containing email. Preserved the canonical permission, owner, branch, business and audit checks.
- Added an immediate save guard, email trimming, dialog-local error feedback and cleared stale feedback when opening another editor.
- Staging database migration applied: `20261001102024_fix_staff_email_validation.sql`.
- Local browser/API/database acceptance: **8 passed**.
- Actual `https://admin.staging.qazipro.com` acceptance: **7 passed**. Existing staff creation, role edit, active state, branch persistence, new invitation, reload, invalid email, unauthorized staff and cross-business branch denials verified. Test identities/invitation removed; no real staff access changed.
- The root-cause fix is already effective on the staging domain. UI feedback changes also built successfully in protected Admin preview: `https://qazipro-restaurant-admin-staging-62tfmvsmh.vercel.app`. No production alias changed.
- Re-run: `powershell -NoProfile -File scripts/run-admin-client-portal-staging.ps1 -Suite staff-save -TargetUrl https://admin.staging.qazipro.com`.

## Website work preserved and continued

- Controlled desktop menus with pointer corridor, delayed close, Escape, outside click and keyboard handling; mobile accordion, focus trap and body-scroll restoration.
- Local `/client-portal` links no longer use the misconfigured Restaurant Admin URL.
- Real existing QaziPro screenshots replace the invented hero visual. Carousel pauses for interaction, hidden tab and reduced motion; keyboard/touch/manual controls included.
- Consistent CTA liquid-fill and restrained hover tokens; removed unused cursor handlers and duplicate animation work. Lenis/GSAP share one ticker with cleanup.
- Our Work grid and cards repaired. A late global content-grid rule caused 197px overflow at 360px; fixed responsive 1/2/3-column layouts. Nine widths and filter/reset verified.
- Footer branding, `/our-work` redirect and 60-second ISR fallback retained/verified.
- Next.js and matching ESLint config updated to 16.3.8; website npm audit: **0 vulnerabilities**. Root workspace dependency audit is not represented by this result.
- Corrected website lockfile, excluded `.next-acceptance` from lint and local generated files from Vercel uploads.
- Removed the public header link to the separate mock demo. Header uses the real Book a demo lead route. **This does not satisfy the real interactive Admin demo requirement.**

## Signed onboarding and Client Portal

- Visible-ink PNG validation rejects transparent, blank, solid, corrupt and oversized signatures. It does not certify identity or legal validity.
- Atomic server-only `submit_platform_onboarding_signed` RPC commits application, original PDF and timeline together, serializes concurrent request-key replay, and refuses inconsistent replay. No authenticated/anonymous direct execution.
- Database update guards protect original submitted content, pricing, terms, form version, signature, portal ownership email and original PDF bytes/hash. Workflow status, assigned POC and internal notes remain editable. Privileged retention/deletion is not silently changed.
- Staging migrations applied: `20261001105754_atomic_onboarding_signed_submission.sql`, `20261001111224_protect_signed_onboarding_snapshots.sql`.
- **18 onboarding checks passed**: real staging save, concurrent replay, one row/one PDF, rollback on PDF failure, malformed service rejection, blank signature rejection, anonymous RPC denial, protected PDF download, immutable snapshot/ownership/PDF, editable workflow metadata.
- **14 Client Portal checks passed**: real provider-issued 8-digit OTP, verification/session restore, application isolation, private-note exclusion, actual Super Admin status/POC update, signed PDF, request information, client reply in both UIs, private file upload/download and logout. OTP was obtained via staging admin tooling; inbox delivery is not claimed.
- Generated one-page signed agreement visually rendered and inspected. QA document is synthetic and stored only under `artifacts/website-deep-recovery/`.
- **17 CMS browser checks passed**: About save/reload/publish/public update, Team draft/reorder/image/publish/unpublish/republish/delete, public update, form section draft, filters and non-platform access denial. Original staging About/form content restored; temporary team and identities cleaned up.

## Evidence and build status

- Website unit tests: **12/12**. Website lint/typecheck passed. Admin changed-component lint and typecheck passed.
- Public regression: repeated 20-cycle hover corridor/leave, rapid switching, keyboard/Escape/outside click, carousel, separate portal route, responsive header at nine widths, 14 routes, footer logo, legacy redirect, reduced motion, no runtime errors. Extended suite includes Our Work responsive grid/filter regression.
- Tools used across this continuation: Figma metadata, Context7 docs, shadcn examples, Playwright, Chrome DevTools; Supabase MCP/CLI when available. Plugin availability changed during the session; CLI provided continuity. No screen recording was present in the supplied attachment directory.
- Chrome DevTools latest local optimized homepage lab: **LCP 1307ms; CLS 0.00**, CPU 1x/network unthrottled. Previous observed local LCP runs: 3486ms and 1102ms. Do not represent this as field Core Web Vitals or all-device performance acceptance.
- Playwright Event Timing sample: 91 menu/carousel/keyboard events, maximum 112ms. **Not field INP.** Long-session/mobile throttled performance remains unverified.
- Website Vercel preview builds READY; production site/backend untouched. Previews are Vercel-login protected. Latest URL is recorded in the handoff response.
- Security advisor error-level checks returned no issues. This is not a claim that all warning-level findings or the entire platform security audit passed.

## Remaining work — do not convert these to PASS

1. Real Admin demo: `apps/admin/components/demo-portal.tsx` is a separate mock. Need the actual Admin components/routes with an isolated seeded tenant, server-side external-side-effect suppression and reset policy. Public mock link is removed, but this implementation is still missing.
2. Full CMS/form-builder coverage: per-order fees and complete package/percentage/included-service policy; all requested content fields/sections and no-code preview parity need implementation/acceptance. About now has a no-code editor; other content documents still use structured JSON.
3. Complete visual, accessibility, reduced-motion and all-route/device performance review. No universal butter-smooth/60fps claim. SEO/indexed legacy audit needs completion; Google deindexing is external.
4. Re-run full protected-preview E2E and final manual acceptance after secure demo work. Do not deploy or promote to production without explicit approval.
5. Admin UI feedback is in preview; staging database fix is already live. Do not confuse those deployment scopes.

Do not redo the proven staff fix or overwrite unrelated `apps/desktop-pos/tsconfig.app.tsbuildinfo`/pre-existing artifact changes. Tests and migrations are in source control scope; generated QA artifacts are not release assets.

## Resumed continuation: additional verified results

- Collected the previously running public regression: **31 checks passed**. Previous website preview also finished READY. Supabase error-level security advisor: no issues.
- Re-tested actual `admin.staging.qazipro.com`: **7/7 staff checks passed again**; fixtures removed.
- About no-code editor now covers eyebrow/headline/story/mission/vision/team heading/CTA text and destination. Preview updates before saving. Public About consumes the new published fields. Existing unknown fields are retained.
- Server validates About content and restricts CTA destinations to known public routes. Unsaved edits disable Publish. Publication compares draft revision and published version, rejecting stale concurrent publication rather than replacing a newer draft. A saved revision resets editor state without an effect overwriting normal typing.
- Expanded real staging CMS browser/API/database suite: **19/19 passed** (including new fields, unsaved-publish prevention and rendered public CTA). All original About/form content restored and synthetic fixtures removed. First run identified a CTA accessible-name mismatch, fixed before the passing run.
- Super Admin tests **93/93 passed**, including 9 About schema cases. Super Admin build/typecheck and changed-file lint passed. Website lint/typecheck passed.
- Mobile Lighthouse on local homepage: accessibility **100**, best practices **100**, SEO **61**, agentic browsing **67**. Failure details include intentional staging `noindex`, a robots audit failure despite direct `200 text/plain` with `User-Agent: * / Disallow: /`, and missing llms.txt. Do not remove staging noindex to inflate the score. This is not all-route accessibility or production SEO certification.
- Latest website preview: https://qazipro-public-website-d002k40aa.vercel.app — READY, Next.js 16.3.8, 19-second Vercel build. Vercel authentication required. No production promotion.
- Super Admin preview: https://qazi-pro-restaurant-platform-super-admin-k6d31abwb.vercel.app — READY, 16-second Vercel build. Uses existing project/application authentication; deployment protection was not changed. New About editor and publish revision safeguards included. Full CMS mutation acceptance was run against the local app with real staging backend, not against this new preview.
- Verification and React/Next.js skills guided boundary tests, server authorization/validation, and revision-keyed state rather than effect-based resets. Deployment skills kept changes on preview with protection enabled.
