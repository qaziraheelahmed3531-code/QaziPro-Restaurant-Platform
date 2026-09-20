# Supabase authentication setup

The customer app uses Supabase Auth with cookie-backed SSR sessions. It supports Google OAuth and an eight-digit email OTP. Never add a service-role or secret key to this app.

## Environment

Copy these public values from **Supabase Dashboard → Project Settings → API** into `apps/customer/.env.local`:

```env
NEXT_PUBLIC_SUPABASE_URL=https://YOUR_PROJECT_REF.supabase.co
NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY=YOUR_PUBLISHABLE_KEY
```

Restart the Next.js development server after changing environment values.

## URL configuration

In **Supabase Dashboard → Authentication → URL Configuration**:

- Set Site URL to the production customer origin.
- Add `http://localhost:3000/auth/callback` for local development.
- Add `https://YOUR_PRODUCTION_DOMAIN/auth/callback` for production.
- Add preview callback origins explicitly if preview deployments need sign-in.

The app only accepts an internal `next` path after OAuth, preventing an open redirect.

## Google provider

1. In Google Cloud Console, create an OAuth 2.0 Web application.
2. Add the Supabase callback URL shown on **Authentication → Providers → Google** as an authorized redirect URI. It normally has this form:
   `https://YOUR_PROJECT_REF.supabase.co/auth/v1/callback`
3. Add the application origins, such as `http://localhost:3000` and the production origin, under authorized JavaScript origins.
4. Put the Google client ID and secret into the Supabase Google provider settings, then enable the provider.

Google secrets belong in Supabase, not in this repository or browser environment.

## Email verification codes

Enable the Email provider in Supabase. In **Authentication → Email Templates → Magic Link**, use `{{ .Token }}` in the message body instead of only using `{{ .ConfirmationURL }}`. For example:

```html
<p>Your Italian Pizza sign-in code is:</p>
<h2>{{ .Token }}</h2>
<p>This code is private. Do not share it.</p>
```

Customer and Admin send using `signInWithOtp({ email, options: { shouldCreateUser: true } })` and verify the complete string using `verifyOtp({ email, token, type: "email" })`. Leading zeros are retained. Each box uses the shared editing/keyboard rules. Resend waits for the configured client cooldown; the provider also enforces its own limits.

## Session flow

- The browser client starts OAuth, sends email OTPs, verifies codes and signs out.
- `/auth/callback` exchanges the OAuth authorization code for a Supabase session on the server.
- Root `proxy.ts` validates/refreshes auth claims and carries refreshed cookies to the response.
- `/account` verifies the current user server-side and then listens for browser auth-state changes.
- Admin OTP success navigates to `/auth/complete`, which validates the current user, active staff membership, active business and exact permissions before redirecting to an allowed Admin page. A normal customer is denied Admin access. Existing Google callbacks remain unchanged.

## Pre-launch checks

- Test Google login on local, preview and production origins.
- Test a new email and an existing email, including invalid and expired OTPs.
- Confirm resend throttling and production SMTP delivery.
- Confirm the session survives refresh and a new tab.
- Confirm sign-out clears the account state.
- Check delivery failures in **Supabase Dashboard → Authentication → Logs** and confirm the SMTP provider response. Do not copy tokens or credentials into tickets.
