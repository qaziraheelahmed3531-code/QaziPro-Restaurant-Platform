# Staging email OTP configuration

The Admin and Customer use Supabase's `signInWithOtp` + `verifyOtp` and share an eight-digit UI contract. Supabase chooses code versus link through the Magic Link email template, not the SDK method name. A link-only remote template caused the reported real-inbox mismatch.

The versioned template displays `{{ .Token }}` only in the email body. There is no sign-in URL and no code in the subject. Invitation, recovery, signup confirmation, OAuth, SMTP credentials and permissions are not changed. This template is project-wide for email OTP sign-ins, not Admin-only. Existing Customer email OTP uses the same eight-digit contract.

Use the narrow overlay, **never push the entire root development config to hosted staging**:

```powershell
node --test scripts/staging-auth-otp/test.mjs
npx supabase config diff --workdir scripts/staging-auth-otp --project-ref jzisqjvroxodvmqxzsob
npx supabase config push --workdir scripts/staging-auth-otp --project-ref jzisqjvroxodvmqxzsob
```

Require Supabase CLI 2.118.0 or a version verified to preserve undeclared remote settings. Inspect the diff and project name before confirming. Expected project: QaziPro Restaurant Staging. Do not use this procedure on production.

27 September 2026: staging push changed only magic-link subject and content; hosted OTP length already matched eight. Other 22 remote-only properties were left unchanged. No schema change or app deployment is necessary for the hosted template correction.

Readback via a second push reported Auth up to date and zero changes. Four template/config tests, 12 Admin login browser checks and the Customer/Admin OTP contract suite passed. The latter's obsolete password-first Admin test state was updated to match the current Google/code form. These automated tests send no real emails.

A single fresh public Admin request after the correction reached the code-entry screen without an error. Inbox contents and successful verification remain user-assisted acceptance, not an automated PASS.

Real acceptance requires one new request from the public Admin to the explicitly approved inbox. The user enters the code in the browser; do not collect, screenshot, log or save the code or credentials. A successful provider request does not prove inbox delivery or authenticated access. Keep the gate pending until verified.

Reference: https://supabase.com/docs/guides/auth/auth-email-passwordless
