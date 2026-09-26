"use client"

import { useState, type FormEvent } from "react"
import Image from "next/image"
import { createClient } from "@/lib/supabase/client"

export function LoginForm({ authCallbackUrl, initialError = "", googleStatus = "unknown" }: { authCallbackUrl: string; initialError?: string; googleStatus?: "enabled" | "disabled" | "invalid-client" | "unknown" }) {
  const configured = Boolean(process.env.NEXT_PUBLIC_SUPABASE_URL && process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY)
  const [email, setEmail] = useState("")
  const [busy, setBusy] = useState(false)
  const [message, setMessage] = useState(initialError || (!configured
    ? "Authentication is not configured. Start this portal with npm run dev:super-admin from the repository root."
    : googleStatus === "disabled"
      ? "Google sign-in is disabled in this Supabase environment. A project administrator must enable the Google provider."
      : googleStatus === "invalid-client"
        ? "The Google OAuth Client ID configured in Supabase is invalid. Replace it with a Google Web application Client ID."
      : googleStatus === "unknown"
        ? "Google sign-in status could not be verified. Refresh this page and try again."
      : ""))

  async function emailLogin(event: FormEvent) {
    event.preventDefault()
    setBusy(true); setMessage("")
    try {
      const { error } = await createClient().auth.signInWithOtp({
        email: email.trim().toLowerCase(),
        options: { emailRedirectTo: authCallbackUrl, shouldCreateUser: false },
      })
      if (error) throw error
      setMessage("Secure sign-in link sent. Check your work email.")
    } catch {
      setMessage("Sign-in could not be started. Check configuration and try again.")
    } finally { setBusy(false) }
  }

  async function googleLogin() {
    setBusy(true); setMessage("")
    try {
      const { error } = await createClient().auth.signInWithOAuth({
        provider: "google",
        options: { redirectTo: authCallbackUrl },
      })
      if (error) throw error
    } catch {
      setBusy(false)
      setMessage("Google sign-in could not be started. Check the staging authentication configuration.")
    }
  }

  return <section className="login-card">
    <div className="login-brand"><Image src="/qazipro-logo.png" alt="QaziPro" width={70} height={70} priority/><div><strong>QaziPro</strong><span>Platform Control Center</span></div></div>
    <p className="eyebrow">INTERNAL OPERATIONS</p>
    <h1>Run every restaurant from one calm command center.</h1>
    <p className="login-copy">Restricted to authorized QaziPro company staff. Restaurant owner accounts cannot enter this portal.</p>
    <button className="button button-secondary google-button" type="button" onClick={googleLogin} disabled={busy || !configured || googleStatus !== "enabled"}>
      {/* Official Google Identity mark; decorative and never used as authority. */}
      <Image src="https://developers.google.com/static/identity/images/g-logo.png" alt="" width={19} height={19} unoptimized aria-hidden="true"/>
      Continue with Google
    </button>
    <div className="divider"><span>or use your work email</span></div>
    <form onSubmit={emailLogin} className="login-form">
      <label htmlFor="platform-email">QaziPro work email</label>
      <input id="platform-email" type="email" required autoComplete="email" value={email} onChange={(event) => setEmail(event.target.value)} placeholder="name@qazipro.com"/>
      <button className="button" disabled={busy || !configured}>{busy ? "Please wait…" : "Send secure sign-in link"}</button>
    </form>
    {message ? <p className="form-message" role="status">{message}</p> : null}
    <footer>Environment access, permission changes and sensitive actions are audited.</footer>
  </section>
}
