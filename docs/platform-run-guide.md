# Open and run every QaziPro application

Run commands from `D:\WebProjects\ITALIAN-PIZZA`. Install dependencies once with `npm ci`. Copy each app's `.env.example` to its ignored `.env.local` only when needed and use the correct local/staging public keys; never place a service-role key in Mobile.

## Customer website

```powershell
npm run dev:website
```

Open `http://localhost:3000`. For localhost tenant resolution set `STOREFRONT_BUSINESS_SLUG` in `apps/customer/.env.local`. In production, tenant resolution uses the verified hostname.

## Restaurant Admin Portal, Web POS and Kitchen/KDS

```powershell
npm run dev:admin
```

Open `http://localhost:3001`, sign in with an invited restaurant staff account, then use:

- Admin dashboard: `http://localhost:3001/`
- Web POS: `http://localhost:3001/pos`
- Kitchen/KDS: `http://localhost:3001/kitchen`
- Orders: `http://localhost:3001/orders`

The account must have the relevant server-enforced permission and branch assignment.

## Windows Desktop POS

```powershell
npm run dev:desktop-pos
```

This opens the Electron POS window and its local Vite renderer automatically. Sign in with an invited account that has Desktop POS access. To create Windows installer and portable packages:

```powershell
npm run package:desktop
```

Artifacts are written under `apps/desktop-pos/release` after a successful package build.

The verified internal staging artifacts are `QaziPRO POS Desktop Setup 0.1.0.exe` (installer) and `QaziPRO POS Desktop 0.1.0.exe` (portable). Double-click either file to open it. These local artifacts are currently unsigned, so Windows may show a SmartScreen warning; public distribution requires an approved Authenticode certificate.

## Android customer app

Start an Android emulator in Android Studio or connect a USB-debug-enabled device, then run:

```powershell
npm run dev:android
```

Public mobile configuration belongs in `apps/mobile/.env.local` using the names in `.env.example`. Android native notifications require a development/internal build; real FCM needs the Firebase client file plus backend-only worker credentials.

## iOS customer app

On macOS with Xcode and an iOS Simulator:

```bash
npm run dev:ios
```

Windows cannot launch an iOS Simulator. From Windows, start Metro with `npm run dev:mobile` and use an eligible physical iPhone/internal EAS build, or build on EAS after Expo login and Apple credentials are configured. This is an external Apple/macOS requirement, not an application-code failure.

## Run both web apps

Use two PowerShell terminals:

```powershell
npm run dev:website
```

```powershell
npm run dev:admin
```

Use additional terminals for Desktop POS and Mobile. Each development server is long-running, so separate terminals keep logs readable.

## Production-style local verification

```powershell
npm run lint
npm run test:mobile
npm run test:push
npm run build
npm run audit:mobile-artifacts
```

The customer production server uses port 3000 and Admin uses port 3001:

```powershell
npm --workspace apps/customer run start
npm --workspace apps/admin run start
```

Do not point local commands at Production Supabase while testing changes.
