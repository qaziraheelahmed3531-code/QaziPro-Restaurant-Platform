# Customer + Admin email OTP fix

7 September 2026. Scope: email sign-in, OTP inputs, safe errors, session restoration and the Admin authorization handoff. No environment keys, Supabase templates, provider settings, database schema or unrelated features were changed. No packages were installed.

## Implementation

- `packages/shared/src/auth.ts` defines `EMAIL_OTP_LENGTH = 8`, resend duration, complete-token validation, paste/edit/keyboard rules and safe email-auth errors. Tokens remain strings, including leading zeros.
- Customer and Admin render eight equal-width numeric inputs. Their small app-local presentation wrappers use the same shared behavior; this avoids coupling the separately installed React runtimes across applications.
- Full-code paste (including spaces/hyphens), numeric autofill, auto-advance, backspace and arrows are supported. Letters and overlength input are rejected. Verification stays disabled until all digits are present.
- Customer submits the full token through its existing Supabase SSR browser client, updates the authenticated account and refreshes server account data.
- Admin replaces link-only messaging with email/code screens, real `signInWithOtp` and `verifyOtp`, resend countdown, change-email reset, safe errors, loading states and synchronous request guards. Existing Motion provides reduced-motion-aware form transitions.
- Admin success navigates to `/auth/complete`. The server revalidates the Supabase user, active staff membership, active business and saved permissions before choosing the permitted landing route. Authentication alone never grants Admin access.
- The existing Google provider, redirect URLs and OAuth callbacks were retained. No unnecessary sign-out was added.
- Old six-digit wording and checks were removed from application source and related auth documentation.

The SDK calls follow Supabase's documented [passwordless email flow](https://supabase.com/docs/guides/auth/auth-email-passwordless). The project's verified eight-digit configuration—not the documentation's default example—determines input length.

## Results

| Requested check | Result and evidence |
| --- | --- |
| Customer eight-digit UI | PASS — actual component render/handler unit test; browser visuals pending |
| Customer paste and leading zero | PASS — full spaced/hyphenated token populates all inputs |
| Customer full-token verifyOtp | PASS — component contract plus real provider verification |
| Customer session persistence | PASS — new SSR client restores cookies; two fresh `/account` requests show authenticated state |
| Admin old link-only UI removed | YES |
| Admin email OTP send | PASS — actual handler/SDK call contract; real inbox delivery not retested |
| Admin eight boxes | PASS — component render/handler unit test; browser visuals pending |
| Admin verifyOtp | PASS — complete-token contract and real provider verification |
| Staff authorization after OTP | PASS — live server completion routes to the exact granted module |
| Unauthorized customer denied | PASS — live authenticated normal customer redirected to unauthorized login |
| Inactive staff denied | PASS — deactivating the disposable membership denies its next protected request |
| Wrong OTP | PASS — provider rejects a wrong token; UI maps errors safely |
| Expired OTP | PASS — mocked provider error mapping; actual expiry interval not waited out |
| Incomplete OTP | PASS — verification disabled and no SDK verification request |
| Rate limit / resend / change email | PASS — mocked error, request, cooldown and reset checks |
| Customer Google regression | PASS — provider/callback contract; interactive Google login NOT TESTED |
| Admin Google regression | PASS — provider/callback contract; interactive Google login NOT TESTED |
| Customer build | PASS |
| Admin build | PASS |
| Backend type build | PASS |
| Customer + Admin lint | PASS |

Tests: `node apps/customer/scripts/test-email-otp.mjs` and `node apps/admin/scripts/test-email-otp-live.mjs` (the latter requires production test servers on loopback ports 3100/3101).

The live integration used two disposable Auth accounts. Supabase's server-side [generateLink API](https://supabase.com/docs/reference/javascript/auth-admin-generatelink) generated real email OTPs without sending email; the public client verified those complete codes. This verifies provider authentication and cookie-backed session restoration, **not inbox delivery or browser interaction**. All disposable accounts/memberships were deleted; the existing OWNER fingerprint was unchanged. No OTPs, session tokens or keys were printed.

## Remaining acceptance

Full acceptance remains pending: real email send/receive/resend with a user-provided test inbox; desktop 1440 × 900 and mobile 390 × 844 browser interaction; interactive Customer/Admin Google OAuth and browser-refresh checks. The Browser skill found no connected browser. An authorized test email was requested but none was supplied during this run. Enter verification codes directly in the browser, not in chat.

The email template is already configured and was deliberately left untouched. Do not reset the template or weaken staff permissions to complete these checks.
