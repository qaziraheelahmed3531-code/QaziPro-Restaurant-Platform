"use client"

import { useEffect, useRef, useState, type FormEvent } from "react"
import type { User } from "@supabase/supabase-js"
import { AppLoader } from "@italian-pizza/shared/app-loader"

import { Button } from "@/components/ui/button"
import { authErrorMessage, logAuthDiagnostic } from "@/lib/auth/errors"
import { createClient } from "@/lib/supabase/client"

import { EMAIL_OTP_RESEND_SECONDS as RESEND_SECONDS, emptyOtpDigits, isCompleteEmailOtp } from "@italian-pizza/shared"
import { EmailOtpInput } from "./email-otp-input"
import { useRouter } from "next/navigation"

type OtpVerificationFormProps = {
  email: string
  onChangeEmail: () => void
  onError: (message: string) => void
  onVerified: (user: User) => void
}

export function OtpVerificationForm({ email, onChangeEmail, onError, onVerified }: OtpVerificationFormProps) {
  const router = useRouter()
  const [digits, setDigits] = useState(emptyOtpDigits)
  const [busy, setBusy] = useState(false)
  const [resending, setResending] = useState(false)
  const [countdown, setCountdown] = useState(RESEND_SECONDS)
  const [notice, setNotice] = useState("")
  const requestPending = useRef(false)

  useEffect(() => {
    if (countdown <= 0) return
    const timer = window.setInterval(() => setCountdown((value) => Math.max(0, value - 1)), 1000)
    return () => window.clearInterval(timer)
  }, [countdown])

  const verify = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault()
    if (requestPending.current) return
    onError("")
    const token = digits.join("")
    if (!isCompleteEmailOtp(token)) {
      onError("Please enter the complete verification code.")
      return
    }

    requestPending.current = true
    setBusy(true)
    try {
      const supabase = createClient()
      const { data, error } = await supabase.auth.verifyOtp({ email, token, type: "email" })
      if (error) throw error
      if (!data.user || !data.session) throw new Error("Verified session did not include a user.")
      onVerified(data.user)
      router.refresh()
    } catch (error) {
      logAuthDiagnostic("email-verify", error)
      onError(authErrorMessage(error, "otp-verify"))
    } finally {
      requestPending.current = false
      setBusy(false)
    }
  }

  const resend = async () => {
    if (countdown > 0 || requestPending.current) return
    onError("")
    setNotice("")
    requestPending.current = true
    setResending(true)
    setCountdown(RESEND_SECONDS)
    try {
      const supabase = createClient()
      const { error } = await supabase.auth.signInWithOtp({ email, options: { shouldCreateUser: true } })
      if (error) throw error
      setDigits(emptyOtpDigits())
      setCountdown(RESEND_SECONDS)
      setNotice("A new code has been sent to your email.")
    } catch (error) {
      logAuthDiagnostic("email-resend", error)
      onError(authErrorMessage(error, "email-send"))
    } finally {
      requestPending.current = false
      setResending(false)
    }
  }

  return (
    <form className="otp-form" onSubmit={verify}>
      <div className="otp-heading">
        <div><span>VERIFICATION CODE</span><h2>Check your email</h2></div>
        <button type="button" disabled={busy || resending} onClick={onChangeEmail}>Change email</button>
      </div>
      <p>We sent a sign-in code to <strong>{email}</strong>.</p>
      <EmailOtpInput digits={digits} onChange={setDigits} disabled={busy || resending}/>
      {notice && <p className="otp-notice" role="status">{notice}</p>}
      <Button type="submit" size="lg" disabled={busy || resending || !isCompleteEmailOtp(digits.join(""))}>
        <AppLoader active={busy} label="Verifying code" />
        {busy ? "Verifying…" : "Verify and sign in"}
      </Button>
      <button className="otp-resend" type="button" onClick={resend} disabled={countdown > 0 || resending || busy}>
        <AppLoader active={resending} label="Resending code" />
        {resending ? "Resending…" : countdown > 0 ? `Resend code in ${countdown}s` : "Resend code"}
      </button>
    </form>
  )
}
