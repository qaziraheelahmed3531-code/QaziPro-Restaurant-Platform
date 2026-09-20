# Admin architecture

The Admin application is a Next.js 16 App Router project backed directly by Supabase Auth, PostgreSQL, Storage and Realtime. Server components establish the authenticated staff context and enforce a named permission before reading each protected route. PostgreSQL RLS and security-definer RPCs repeat authorization at the data boundary; hiding navigation is never the security control.

## Runtime boundaries

- `apps/admin/app/(dashboard)`: protected operational pages.
- `apps/admin/components`: interactive POS, KDS, register, inventory, orders and generic CMS managers.
- `apps/admin/lib/auth.ts`: membership and effective-permission resolution.
- `apps/admin/lib/branch.ts`: branch-scoped server context using a safe branch cookie.
- `apps/admin/lib/printing.ts`: browser printer adapter and future middleware boundary.
- `supabase/migrations`: authoritative schema, RLS, permissions and transactional commands.
- `packages/shared`: money formatting, statuses and cross-application contracts.

The Admin uses a light, compact shell with permission-filtered navigation, a global branch selector, grouped search and a notification center. Orders use Realtime with bounded 15-second polling as a fallback. Reports are aggregated in PostgreSQL rather than loading raw history into the browser.

## Data consistency

Money is stored as integer PKR units. Order prices are recalculated by `create_order_authoritative`; POS calls it through `create_pos_order`. Daily tokens are assigned atomically per branch and business date. Purchase receipt, inventory consumption and POS client references are idempotent. Legal order transitions are enforced in PostgreSQL.

## Deployment boundary

Customer and Admin deploy as separate Vercel projects against one Supabase project. The backend workspace is a build-checked architecture package; runtime handlers stay beside their Next.js consumer. No live payment provider is enabled without verified merchant credentials and provider documentation.
