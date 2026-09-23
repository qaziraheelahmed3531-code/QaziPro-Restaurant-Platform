"use client"

import { useEffect, useRef, useState, type FormEvent } from "react"
import { AnimatePresence, motion, useReducedMotion } from "motion/react"
import { EMAIL_OTP_RESEND_SECONDS, emailOtpError, emptyOtpDigits, isCompleteEmailOtp } from "@italian-pizza/shared"
import { createClient } from "@/lib/supabase/client"
import { EmailOtpInput } from "@/components/email-otp-input"
import Image from "next/image"
import Link from "next/link"
import { Eye, EyeOff } from "lucide-react"
import { BookDemoModal } from "@/components/book-demo-modal"

export function LoginForm({ initialError = "" }: { initialError?: string }) {
  const [error, setError] = useState(initialError)
  const [busy, setBusy] = useState<"" | "send" | "resend" | "verify" | "google" | "password" | "reset">("")
  const [address, setAddress] = useState("")
  const [password, setPassword] = useState("")
  const [showPassword, setShowPassword] = useState(false)
  const [method, setMethod] = useState<"password" | "code">("password")
  const [sent, setSent] = useState(false)
  const [digits, setDigits] = useState(emptyOtpDigits)
  const [countdown, setCountdown] = useState(0)
  const [notice, setNotice] = useState("")
  const pending = useRef(false)
  const reduced = useReducedMotion()

  useEffect(() => {
    if (countdown <= 0) return
    const timer = window.setTimeout(() => setCountdown(value => Math.max(0, value - 1)), 1000)
    return () => window.clearTimeout(timer)
  }, [countdown])

  const google = async () => {
    if (pending.current) return
    pending.current = true; setBusy("google"); setError("")
    try {
      const { error: authError } = await createClient().auth.signInWithOAuth({ provider: "google", options: { redirectTo: `${window.location.origin}/auth/callback` } })
      if (authError) throw authError
    } catch {
      setError("Google sign-in could not be started. Please try again.")
      pending.current = false; setBusy("")
    }
  }

  async function signInPassword(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    if (pending.current) return
    const email = address.trim().toLowerCase()
    if (!email || !password) { setError("Enter your email and password."); return }
    pending.current = true; setBusy("password"); setError(""); setNotice("")
    try {
      const { error: authError } = await createClient().auth.signInWithPassword({ email, password })
      if (authError) throw authError
      // The completion route verifies an active restaurant staff membership.
      window.location.replace("/auth/complete")
    } catch {
      setError("Sign-in failed. Check your details or use an email code.")
      pending.current = false; setBusy("")
    }
  }

  async function forgotPassword() {
    if (pending.current) return
    const email = address.trim().toLowerCase()
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) { setError("Enter your work email first."); return }
    pending.current = true; setBusy("reset"); setError("")
    try {
      await createClient().auth.resetPasswordForEmail(email, { redirectTo: `${window.location.origin}/auth/callback?type=recovery` })
      setNotice("If this account exists, password reset instructions will arrive by email.")
    } catch {
      setNotice("If this account exists, password reset instructions will arrive by email.")
    } finally { pending.current = false; setBusy("") }
  }

  async function send(resend = false) {
    if (pending.current || countdown > 0) return
    const email = address.trim().toLowerCase()
    if (!email || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) { setError("Please enter a valid email address."); return }
    pending.current = true; setBusy(resend ? "resend" : "send"); setError(""); setNotice("")
    setCountdown(EMAIL_OTP_RESEND_SECONDS)
    try {
      const { error: authError } = await createClient().auth.signInWithOtp({ email, options: { shouldCreateUser: true } })
      if (authError) throw authError
      setAddress(email); setSent(true); setDigits(emptyOtpDigits())
      setCountdown(EMAIL_OTP_RESEND_SECONDS)
      if (resend) setNotice("A new code has been sent to your email.")
    } catch (failure) { setError(emailOtpError(failure, "email-send")) }
    finally { pending.current = false; setBusy("") }
  }

  async function verify(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    if (pending.current) return
    const token = digits.join("")
    if (!isCompleteEmailOtp(token)) { setError("Please enter the complete verification code."); return }
    pending.current = true; setBusy("verify"); setError(""); setNotice("")
    try {
      const { data, error: authError } = await createClient().auth.verifyOtp({ email: address, token, type: "email" })
      if (authError) throw authError
      if (!data.user || !data.session) throw new Error("Missing verified session")
      // A fresh server request checks membership and exact grants; OTP alone never grants Admin access.
      window.location.replace("/auth/complete")
    } catch (failure) {
      setError(emailOtpError(failure, "otp-verify"))
      pending.current = false; setBusy("")
    }
  }

  function changeEmail() {
    if (pending.current) return
    setSent(false); setDigits(emptyOtpDigits()); setError(""); setNotice(""); setBusy("")
    // Keep request cooldown when changing email; never sign out a working Google session.
  }

  return <section className="login-card">
    <div className="qazipro-login-brand"><Image src="/qazipro-logo.png" alt="QaziPRO logo" width={112} height={112} priority/><span><strong>QaziPRO</strong><small>POS ONLINE ORDERING SYSTEM</small></span></div>
    <AnimatePresence mode="wait" initial={false}><motion.div key={sent ? "otp" : "email"} initial={reduced ? false : { opacity: 0, y: 6 }} animate={{ opacity: 1, y: 0 }} exit={reduced ? undefined : { opacity: 0, y: -6 }} transition={{ duration: .18 }}>
      {sent ? <form className="admin-otp-form" onSubmit={verify}>
        <h1>Check your email</h1><p>We sent a verification code to:<br/><strong>{address}</strong></p>
        <span className="login-eyebrow">VERIFICATION CODE</span>
        <EmailOtpInput digits={digits} onChange={setDigits} disabled={Boolean(busy)}/>
        <button className="button" disabled={Boolean(busy) || !isCompleteEmailOtp(digits.join(""))}>{busy === "verify" ? "Verifying…" : "Verify and sign in"}</button>
        <div className="admin-otp-actions"><button className="button button--outline" type="button" disabled={Boolean(busy) || countdown > 0} onClick={() => void send(true)}>{busy === "resend" ? "Resending…" : countdown > 0 ? `Resend in ${countdown}s` : "Resend code"}</button><button className="button button--outline" type="button" disabled={Boolean(busy)} onClick={changeEmail}>Change email</button></div>
      </form> : <>
        <h1>Welcome back</h1><p>Sign in to your restaurant operations workspace. Staff access is verified after authentication.</p>
        <button className="button button--outline google-oauth-button" style={{width:"100%"}} type="button" onClick={google} disabled={Boolean(busy)}><Image src="https://developers.google.com/static/identity/images/g-logo.png" alt="" width={20} height={20} aria-hidden="true"/>Continue with Google</button>
        <div className="login-divider">or</div>
        <form className="login-form" onSubmit={method === "password" ? signInPassword : event => { event.preventDefault(); void send() }}>
          <label htmlFor="admin-email">Work email</label><input id="admin-email" name="email" type="email" required autoComplete="email" placeholder="you@example.com" disabled={Boolean(busy)} value={address} onChange={event => setAddress(event.target.value)}/>
          {method === "password" && <><label htmlFor="admin-password">Password</label><div className="login-password-field"><input id="admin-password" name="password" type={showPassword ? "text" : "password"} required autoComplete="current-password" value={password} onChange={event => setPassword(event.target.value)} disabled={Boolean(busy)}/><button type="button" aria-label={showPassword ? "Hide password" : "Show password"} onClick={() => setShowPassword(value => !value)}>{showPassword ? <EyeOff aria-hidden="true"/> : <Eye aria-hidden="true"/>}</button></div><button className="login-text-action" type="button" onClick={() => void forgotPassword()} disabled={Boolean(busy)}>Forgot password?</button></>}
          <button className="button" disabled={Boolean(busy) || (method === "code" && countdown > 0)}>{method === "password" ? busy === "password" ? "Signing in…" : "Sign in" : busy === "send" ? "Sending code…" : countdown > 0 ? `Try again in ${countdown}s` : "Send email code"}</button>
        </form>
        <button type="button" className="login-method-switch" disabled={Boolean(busy)} onClick={() => { setMethod(value => value === "password" ? "code" : "password"); setError(""); setNotice("") }}>{method === "password" ? "Use an email code instead" : "Use your password instead"}</button>
      </>}
    </motion.div></AnimatePresence>
    {notice && <p role="status">{notice}</p>}{error && <p className="auth-error" role="alert">{error}</p>}
    <div className="login-explore"><Link href="/demo">View Demo</Link><span aria-hidden="true">·</span><BookDemoModal triggerClassName="login-explore__button" /></div>
  </section>
}
