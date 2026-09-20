# Client handover checklist

## Before launch

- Apply every migration in filename order and run `supabase/seed.sql` once where demo menu content is wanted.
- Create the first OWNER membership through a trusted database/admin procedure.
- Configure exact Supabase Auth callback URLs for Customer and Admin.
- Set Vercel environment variables from the two `.env.example` files; keep all secret values server-only.
- Complete Setup for branding, branch, hours, delivery, menu, printing and staff.
- Replace placeholder logo, food, banner and review assets with approved production media.
- Place real website and counter COD orders; verify Admin, KDS, tracking, receipt and reports.
- Test each role in a separate browser profile.
- Commission the exact thermal printer and paper width.
- Keep gateways disabled until a provider sandbox has passed signed-webhook, duplicate-event, failure, refund and reconciliation tests.

## Operational ownership

The restaurant owner manages normal catalog, availability, content, branch, hours, delivery, staff, stock and reporting changes in Admin. Technical support remains responsible for migrations, secret rotation, DNS/Vercel, Supabase quotas/backups, payment adapters and hardware middleware.

## Recovery and support

See `docs/restaurant-os-qa.md` for the exact local evidence, live configuration gaps and remaining hardware/browser checks. Local build success does not replace the authenticated production service test.

Record the Supabase project owner, Vercel owners, domain registrar, approved staff list and incident contact outside the repository. Enable provider backups/log retention appropriate to the business. Never include credentials in screenshots, tickets or repository files.
