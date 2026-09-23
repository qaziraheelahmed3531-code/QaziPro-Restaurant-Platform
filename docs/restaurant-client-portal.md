# QaziPro Restaurant Operations Portal

This is the existing `apps/admin` restaurant-staff portal, not QaziPro Super Admin. It retains the existing `business_id` tenant, branch assignments, Supabase RLS, server-authoritative orders and shared Website/Mobile data. The UI layer does not create a second source of business rules.

## Reference review and design

The supplied 5m42s operations video was reviewed across its full timeline. Useful interaction patterns: a scan-friendly dashboard with real KPI drill-down; orders with status tabs and detail actions; a low-distraction kitchen board; a quick POS cart; searchable menu, branches, reports, customers and staff; contextual settings; and compact help, notifications and account actions. The reference branding, illustrations, copy and colors were not reproduced. No Figma file key or specific QaziPro dashboard frame was present in the repository, so the existing canonical `apps/admin/public/qazipro-logo.png` and tenant-aware CSS variables were used.

`apps/admin/app/client-portal.css` defines a shared 4/8px spacing rhythm, control/card radii, restrained shadow and 160ms interaction duration. Tenant primary/secondary colors remain sourced from restaurant branding in `AdminShell`. Reduced-motion users do not receive skeleton or hover movement. Existing operational screens and their backend behavior remain in place; the new layer improves their shared shell, login, loading and help experiences. It is not a claim that every older screen was visually rebuilt.

| Reference area | Existing route | Main action / behavior |
| --- | --- | --- |
| Dashboard | `/` | Real metrics, current branch, operational shortcuts |
| Orders / details | `/orders` | Filter, inspect and take legal status actions |
| Kitchen / preparation | `/kitchen` | Branch-scoped preparation workflow |
| Walk-in POS | `/pos` | Existing authoritative checkout, register and receipt flow |
| Menu / item editor | `/menu`, `/categories`, `/modifiers`, `/deals` | Search, edit and branch-aware catalog controls |
| Branches / reports | `/branches`, `/reports` | Manage assigned outlets; aggregate permitted data |
| Customers / staff | `/customers`, `/users` | Permission-scoped lookup and management |
| Settings / audit | `/settings`, `/audit-logs` | Authorized configuration and immutable history |
| Help / notifications | `/help`, `/notifications` | Workflow links, QaziPro support and real alerts |

The video uses fast section navigation, inline action feedback, drawers and task-oriented modals; existing working route-level interactions were retained. Skeletons now match dashboard/table layouts for major routes. The public demo at `/demo` is an explicitly labelled, in-memory, read-only sample with no production tenant access; its state resets on reload.

## Navigation, permissions and branch context

Sidebar and command-palette entries derive from the authenticated `AdminContext` permissions. The server routes and database still enforce permissions; hiding a link is not an authorization boundary. `Ctrl+K` (or `Cmd+K`) opens the command palette, arrows choose a result, Enter opens it and Escape closes it. Outside editable fields, Ctrl/Cmd+1…6 navigate Dashboard, Orders, Menu, Reports, Customers and Settings **only when permitted**. “Add menu item” opens the real product editor for users with `products.manage`. Sidebar collapse preference is local to the browser.

The top bar restores only an active branch from the verified staff branch list; invalid saved branches are cleared. Owners can select All branches where the existing route supports it. Branch changes dispatch the existing context event and refresh server data. The online-order pause control writes `branches.temporarily_closed` for the selected business/branch only after confirmation; assigned branch access and `branches.manage` are enforced by RLS. Opening hours and other ordering rules still apply.

## Authentication, demo requests and support

The split login keeps Google OAuth and email-code sign-in, and adds password sign-in/reset. `/auth/complete` checks active staff membership after authentication. Recovery callbacks go through `/auth/reset`, where password changes require an authenticated staff account. A reset request gives an enumeration-safe message. No staff password is stored in this app.

“Book a Demo” submits to `/api/demo-request`. The server checks same-origin JSON input, validates fields, uses a honeypot and the existing distributed rate limiter, then writes via a **server-only** service role to `platform_demo_requests`. Migration `202609210005_restaurant_portal_demo_leads.sql` was applied **only** to linked staging project `jzisqjvroxodvmqxzsob`; a follow-up migration dry-run was up to date. Set `DEMO_LEADS_ENABLED=1` and, outside a production deployment, `STAGING_SUPABASE_PROJECT_REF` to the exact project in `NEXT_PUBLIC_SUPABASE_URL`. The table has RLS enabled and grants no browser access. The mismatched local `.env.local` was left untouched; acceptance ran in an isolated staging-configured process on port 3101.

All Contact Support links open `wa.me/923075008055` (`+923075008055`) with safe restaurant/branch names only; no internal IDs or secrets enter the message. The Help Center links to the user's permitted routes rather than exposing inaccessible actions.

## Verification and operational boundaries

Run Admin lint/build, existing checkout/RLS/tenant/branch regressions, and browser checks at 360px, tablet and desktop. An isolated DB should run `supabase/tests/restaurant-client-portal.sql` after the demo-leads migration. The public sample demo is not a write-enabled tenant and does not substitute for signed-in staff acceptance. `./scripts/run-admin-client-portal-staging.ps1` passed 20 staging checks: owner and limited-staff login, branch/tenant RLS, command palette and Book a Demo write. Temporary leads and identities were deleted and verified absent. Password-recovery **email delivery** still requires a real mailbox/provider test.

No public QaziPro marketing site or Super Admin changes are part of this portal update. Source changes to Restaurant Admin still need deployment before a staging browser can verify authenticated end-to-end flows.
