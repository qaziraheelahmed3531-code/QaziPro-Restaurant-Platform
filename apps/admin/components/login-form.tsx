"use client"

import { useEffect, useRef, useState, type FormEvent } from "react"
import { AnimatePresence, motion } from "motion/react"
import { useReducedMotionPreference } from "@/lib/use-reduced-motion"
import { EMAIL_OTP_RESEND_SECONDS, emailOtpError, emptyOtpDigits, isCompleteEmailOtp } from "@italian-pizza/shared"
import { createClient } from "@/lib/supabase/client"
import { EmailOtpInput } from "@/components/email-otp-input"
import Image from "next/image"
import Link from "next/link"
import { ArrowRight, LoaderCircle, Mail, ShieldCheck } from "lucide-react"
import { BookDemoModal } from "@/components/book-demo-modal"

export function LoginForm({ initialError = "" }: { initialError?: string }) {
  const [error, setError] = useState(initialError)
  const [busy, setBusy] = useState<"" | "send" | "resend" | "verify" | "google">("")
  const [address, setAddress] = useState("")
  const [sent, setSent] = useState(false)
  const [digits, setDigits] = useState(emptyOtpDigits)
  const [countdown, setCountdown] = useState(0)
  const [notice, setNotice] = useState("")
  const pending = useRef(false)
  const cooldownUntil = useRef(0)
  const reduced = useReducedMotionPreference()

  useEffect(() => {
    if (countdown <= 0) return
    // Wall-clock based so sleeping/background tabs do not extend the cooldown.
    const timer = window.setTimeout(() => setCountdown(Math.max(0, Math.ceil((cooldownUntil.current - Date.now()) / 1000))), 1000)
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

  async function send(resend = false) {
    if (pending.current || Date.now() < cooldownUntil.current) return
    const email = address.trim().toLowerCase()
    if (!email || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) { setError("Please enter a valid email address."); return }
    pending.current = true; setBusy(resend ? "resend" : "send"); setError(""); setNotice("")
    cooldownUntil.current = Date.now() + EMAIL_OTP_RESEND_SECONDS * 1000
    setCountdown(EMAIL_OTP_RESEND_SECONDS)
    try {
      const { error: authError } = await createClient().auth.signInWithOtp({ email, options: { shouldCreateUser: true } })
      if (authError) throw authError
      setAddress(email); setSent(true); setDigits(emptyOtpDigits())
      cooldownUntil.current = Date.now() + EMAIL_OTP_RESEND_SECONDS * 1000
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
    <div className="qazipro-login-brand"><Image src="/qazipro-logo.png" alt="QaziPRO logo" width={112} height={112} priority/><span><strong>QaziPRO</strong><small>RESTAURANT WORKSPACE</small></span></div>
    <AnimatePresence mode="wait" initial={false}><motion.div key={sent ? "otp" : "email"} initial={reduced ? false : { opacity: 0, y: 6 }} animate={{ opacity: 1, y: 0 }} exit={reduced ? undefined : { opacity: 0, y: -6 }} transition={{ duration: .18 }}>
      {sent ? <form className="admin-otp-form" onSubmit={verify} aria-busy={Boolean(busy)}>
        <span className="login-step">02 / VERIFY YOUR EMAIL</span>
        <h1>Check your inbox.</h1><p>Enter the 8-digit sign-in code sent to:<br/><strong>{address}</strong></p>
        <span className="login-eyebrow">VERIFICATION CODE</span>
        <EmailOtpInput digits={digits} onChange={setDigits} disabled={Boolean(busy)}/>
        <button className="button" disabled={Boolean(busy) || !isCompleteEmailOtp(digits.join(""))}>{busy === "verify" ? <LoaderCircle className="login-spinner" aria-hidden="true" /> : <ArrowRight aria-hidden="true" />}{busy === "verify" ? "Verifying…" : "Verify and sign in"}</button>
        <div className="admin-otp-actions"><button className="button button--outline" type="button" disabled={Boolean(busy) || countdown > 0} onClick={() => void send(true)}>{busy === "resend" ? "Resending…" : countdown > 0 ? `Resend in ${countdown}s` : "Resend code"}</button><button className="button button--outline" type="button" disabled={Boolean(busy)} onClick={changeEmail}>Change email</button></div>
      </form> : <>
        <span className="login-step">YOUR NEXT SERVICE STARTS HERE</span>
        <h1>Good to have<br/>you back.</h1><p>One workspace for your restaurant.<br/>Sign in with your team email to get started.</p>
        <button className="button button--outline google-oauth-button" style={{width:"100%"}} type="button" onClick={google} disabled={Boolean(busy)}>{busy === "google" ? <LoaderCircle className="login-spinner" aria-hidden="true" /> : <Image src="https://developers.google.com/static/identity/images/g-logo.png" alt="" width={20} height={20} aria-hidden="true"/>}{busy === "google" ? "Opening Google…" : "Continue with Google"}</button>
        <div className="login-divider">or use your email</div>
        <form className="login-form" aria-busy={Boolean(busy)} onSubmit={event => { event.preventDefault(); void send() }}>
          <label htmlFor="admin-email">Work email</label><input id="admin-email" name="email" type="email" required autoComplete="email" autoCapitalize="none" spellCheck={false} placeholder="you@restaurant.com" disabled={Boolean(busy)} value={address} onChange={event => setAddress(event.target.value)} aria-describedby="admin-email-hint"/>
          <small id="admin-email-hint">We’ll email you an 8-digit sign-in code. No password needed.</small>
          <button className="button" disabled={Boolean(busy) || countdown > 0}>{busy === "send" ? <LoaderCircle className="login-spinner" aria-hidden="true" /> : <Mail aria-hidden="true" />}{busy === "send" ? "Sending code…" : countdown > 0 ? `Try again in ${countdown}s` : "Send sign-in code"}</button>
        </form>
      </>}
    </motion.div></AnimatePresence>
    {notice && <p role="status">{notice}</p>}{error && <p className="auth-error" role="alert">{error}</p>}
    <p className="login-access-note"><ShieldCheck aria-hidden="true"/>Only assigned owners and staff can enter a restaurant workspace.</p>
    <div className="login-explore"><Link href="/demo">View Demo</Link><span aria-hidden="true">·</span><BookDemoModal triggerClassName="login-explore__button" /></div>
  </section>
}
