# Offline Desktop POS

Windows counter application for Restaurant OS. It is intentionally limited to
counter POS work; website orders still require the online Admin application.

## First pairing

1. Install or run the portable EXE on the counter computer.
2. Connect to the internet and sign in with a staff account that has
   `desktop_pos.use` plus the fixed POS permissions. Google sign-in completes in
   the system browser and returns to QaziPRO automatically. Email sign-in sends
   a one-time code; the user's Gmail password is never used.
3. Choose the restaurant. The app downloads that restaurant's current name,
   logo, colors, categories, products, deals, modifiers, prices and replacement
   window.
4. Open the local cash shift. The counter can now continue without internet.

The paired computer appears in Admin → Offline Desktop POS. An owner/manager
with Settings permission can disable or re-enable it there.

## Offline behavior

- New sales, cash received/change, table/takeaway details, notes, held orders,
  receipts, local shifts and eligible replacements are written locally first.
- A local receipt is available immediately; no network round trip blocks a sale.
- Each sale keeps the exact server-issued catalog snapshot used when it was sold.
- Reconnect starts automatic sync immediately and retries every minute while the
  app stays online. Manual **Sync now** is also available.
- Unique device/order keys make retries idempotent. The server validates every
  item/modifier price against the downloaded catalog snapshot before accepting
  it, then creates the Admin order, payment, shift, invoice/audit records and
  kitchen-visible POS status.

## Build

From the repository root:

```powershell
npm run build:desktop
npm run package:desktop
```

Artifacts are written to `apps/desktop-pos/release`:

- `KING'S CAFE Offline POS Setup 0.1.0.exe` — Windows installer
- `KING'S CAFE Offline POS 0.1.0.exe` — portable version

The product name embedded in the installer is static. The restaurant identity
inside the running POS—including logo and name—is downloaded from Admin and
updates automatically after reconnect.
