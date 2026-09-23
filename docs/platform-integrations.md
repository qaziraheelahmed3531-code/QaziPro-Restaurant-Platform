# Platform integrations and ownership

Status values are evidence-based: `PASS`, `EXTERNAL BLOCKER`, or `NOT ENABLED`.

| Integration | Owner / consumer | Secret location | Current status | Production gate |
| --- | --- | --- | --- | --- |
| Supabase PostgreSQL/Auth/Storage | All platform apps | Hosting/Supabase secret stores | PASS on staging; migrations aligned and DB lint clean | New production backup, reviewed migration dry-run, RLS verification |
| Google OAuth for Platform Owner | Super Admin | Supabase Auth provider | EXTERNAL BLOCKER: staging client ID is malformed; named owner login not executed | Create Web OAuth client, configure exact Supabase callback and approved app callbacks, test allowed and denied accounts |
| Geoapify routing/maps | Customer/Admin delivery | Server key; optional restricted browser key | EXTERNAL BLOCKER in public staging; delivery acceptance skipped | Restricted staging/production keys and inside/outside/boundary/provider-failure tests |
| Cash on delivery | Customer, mobile, POS, orders/reports | No third-party secret | PASS | Controlled production smoke order |
| Safepay / PayFast | Customer/Admin payment adapters | Server-only hosting secrets | NOT ENABLED / EXTERNAL BLOCKER | Merchant sandbox credentials, signed webhook and refund tests; keep method hidden meanwhile |
| SMTP | Auth/business email and notifications | Server-only hosting/Supabase Auth | EXTERNAL BLOCKER | Verified sender, mailbox delivery, bounce/failure handling |
| Lead notification webhook | Public website | Website server secrets | Optional; database remains authoritative | Configure only if approved and test non-blocking failure behavior |
| Firebase/APNs push | Backend/mobile | Worker/EAS provider secrets | Code/test boundary PASS; real delivery EXTERNAL BLOCKER | Device credentials, physical-device registration and delivery evidence |
| Google Business/Places reviews | Customer storefront | Server OAuth/API secrets | Optional and tenant-configurable | Approved account/location IDs and quota restrictions |
| Vercel | Four web applications | Vercel project secrets | Customer/Admin staging and public-site preview exist; other production targets not deployed | Git remote, environment matrix, preview QA and explicit release approval |
| Sentry/monitoring | Web/API/worker | Per-environment DSNs/tokens | EXTERNAL BLOCKER | Create staging/production projects and verify controlled errors |
| DNS/SSL | QaziPro and client domains | DNS/Vercel control planes | EXTERNAL BLOCKER for custom staging/production domains | Use provider-issued records only; verify ownership, HTTPS and canonical redirects |
| Windows signing/printing | Desktop POS | CI/signing store; local hardware | Build PASS; signing, clean-PC install and physical print EXTERNAL BLOCKER | Code-signing certificate, installer QA, 58/80mm printer tests |
| Play Console / App Store Connect | Mobile | EAS/store credential stores | Android/iOS exports PASS; publishing EXTERNAL BLOCKER | Signed internal builds, physical devices, review metadata, approval |

Health pages must show `UNKNOWN` when a provider has not supplied trusted evidence. Manual forms cannot mark an app published, a domain healthy or an integration connected.
