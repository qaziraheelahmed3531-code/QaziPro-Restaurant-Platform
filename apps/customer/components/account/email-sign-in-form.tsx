"use client"

import { useRef, useState, type FormEvent } from "react"
import { Mail } from "lucide-react"
import { AppLoader } from "@italian-pizza/shared/app-loader"

import { Button } from "@/components/ui/button"
import { isValidEmail, normalizeEmail } from "@/lib/auth/email"
import { authErrorMessage, logAuthDiagnostic } from "@/lib/auth/errors"
import { createClient, isSupabaseConfigured } from "@/lib/supabase/client"

type EmailSignInFormProps = {
  onCodeSent: (email: string) => void
  onError: (message: string) => void
}

export function EmailSignInForm({ onCodeSent, onError }: EmailSignInFormProps) {
  const pending = useRef(false)
  const [busy, setBusy] = useState(false)
  const [invalid, setInvalid] = useState(false)

  const submit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault()
    if (pending.current) return
    onError("")
    const data = new FormData(event.currentTarget)
    const email = normalizeEmail(String(data.get("email") ?? ""))

    if (!isValidEmail(email)) {
      setInvalid(true)
      onError("Please enter a valid email address.")
      return
    }
    setInvalid(false)

    if (!isSupabaseConfigured()) {
      onError("Sign-in is temporarily unavailable. Please try again later.")
      return
    }

    pending.current = true
    setBusy(true)
    try {
      const supabase = createClient()
      const { error } = await supabase.auth.signInWithOtp({ email, options: { shouldCreateUser: true } })
      if (error) throw error
      onCodeSent(email)
    } catch (error) {
      logAuthDiagnostic("email-send", error)
      onError(authErrorMessage(error, "email-send"))
    } finally {
      pending.current = false
      setBusy(false)
    }
  }

  return (
    <form className="email-sign-in" onSubmit={submit} noValidate>
      <label htmlFor="account-email">Email address</label>
      <div>
        <Mail aria-hidden="true" />
        <input id="account-email" name="email" type="email" disabled={busy} required autoComplete="email" placeholder="you@example.com" aria-invalid={invalid} onChange={() => { if (invalid) setInvalid(false) }} />
      </div>
      <Button type="submit" size="lg" disabled={busy}>
        <AppLoader active={busy} label="Sending sign-in code" />
        {busy ? "Sending code…" : "Continue with Email"}
      </Button>
    </form>
  )
}
