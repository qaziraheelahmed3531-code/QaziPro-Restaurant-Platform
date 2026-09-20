"use client"

import { useEffect, useRef, useState, type FormEvent } from "react"
import { AnimatePresence, motion, useReducedMotion } from "motion/react"
import { EMAIL_OTP_RESEND_SECONDS, emailOtpError, emptyOtpDigits, isCompleteEmailOtp } from "@italian-pizza/shared"
import { createClient } from "@/lib/supabase/client"
import { EmailOtpInput } from "@/components/email-otp-input"
import Image from "next/image"

export function LoginForm({ initialError = "" }: { initialError?: string }) {
  const [error, setError] = useState(initialError)
  const [busy, setBusy] = useState<"" | "send" | "resend" | "verify" | "google">("")
  const [address, setAddress] = useState("")
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
        <h1>Admin sign in</h1><p>Only invited restaurant owners and staff can enter this secure dashboard.</p>
        <button className="button button--outline" style={{width:"100%"}} type="button" onClick={google} disabled={Boolean(busy)}>Continue with Google</button>
        <div className="login-divider">or</div>
        <form className="login-form" onSubmit={event => { event.preventDefault(); void send() }}>
          <label htmlFor="admin-email">Work email</label><input id="admin-email" name="email" type="email" required autoComplete="email" placeholder="you@example.com" disabled={Boolean(busy)} value={address} onChange={event => setAddress(event.target.value)}/>
          <button className="button" disabled={Boolean(busy) || countdown > 0}>{busy === "send" ? "Sending code…" : countdown > 0 ? `Try again in ${countdown}s` : "Continue with Email"}</button>
        </form>
      </>}
    </motion.div></AnimatePresence>
    {notice && <p role="status">{notice}</p>}{error && <p className="auth-error" role="alert">{error}</p>}
  </section>
}
