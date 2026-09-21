# Step 8 platform parity freeze notes

## Implemented parity fixes

- Mobile catalog now renders Admin-managed hero banners, ordered categories, products and deals from the additive frozen `/api/v1/catalog` response.
- Mobile menu search covers product/deal names and descriptions.
- Deal detail, quantity and cart checkout are available without duplicating authoritative price rules.
- Runtime bootstrap branding now drives mobile shell, navigation and primary actions; the build-time colors remain only the safe pre-bootstrap fallback.
- Mobile checkout can select authenticated saved addresses and still relies on server delivery revalidation.
- Address listing and selection is now validated and filtered by the active restaurant branch, so a branch switch cannot reuse an incompatible delivery address.
- Branch switching validates and loads the target catalog before committing the new branch; incompatible cart state is then cleared atomically.
- Mobile order detail uses the real product snapshot field and displays authoritative subtotal, discount, tax, delivery and total.
- Restaurant support phone, WhatsApp and email now appear from bootstrap configuration.
- Maintenance mode blocks mobile navigation instead of being ignored.
- Website realtime reconciliation now covers categories, hero banners, promotions, loyalty and branch overrides in addition to existing restaurant/product settings.
- Admin opening-hours copy now shows the selected branch timezone instead of a fixed Pakistan label.
- One source codebase remains in use for all restaurant websites and all white-label mobile builds.

No database migration or breaking `/api/v1` change was added. Production Supabase and live `qazipro.com` were not touched.

## Pending mobile release checklist

- **BLOCKED BY ACCOUNT:** Expo/EAS login and Android/Apple store accounts.
- **BLOCKED BY CREDENTIAL:** Android signing, Firebase/FCM service credentials, Apple signing/APNs credentials and staging Geoapify key.
- **BLOCKED BY DNS:** `restaurant-a.staging.qazipro.com`, `restaurant-b.staging.qazipro.com` and `admin.staging.qazipro.com` must resolve and receive HTTPS before App/Universal Link proof.
- **BLOCKED BY DEVICE:** physical Android notification delivery and eligible physical iOS notification delivery.
- **BLOCKED BY HOST:** iOS simulator/archive requires macOS/Xcode.
- **EXTERNAL FEATURE:** online gateway remains disabled; COD is the only supported customer payment method.
- **BLOCKED BY ACCOUNT:** private Git remote is not configured.
- **BLOCKED BY CREDENTIAL:** the Windows Desktop POS installer is buildable and launch-tested, but the generated internal artifact is not Authenticode-signed until a trusted code-signing certificate is supplied.

These items require external configuration only; none requires copying or redesigning the restaurant backend/mobile codebase.
