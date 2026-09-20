"use client"

import { useState } from "react"
import { AppLoader } from "@italian-pizza/shared/app-loader"

import { Button } from "@/components/ui/button"
import { authErrorMessage, logAuthDiagnostic } from "@/lib/auth/errors"
import { createClient, isSupabaseConfigured } from "@/lib/supabase/client"

export function GoogleSignInButton({ onError }: { onError: (message: string) => void }) {
  const [busy, setBusy] = useState(false)

  const signIn = async () => {
    onError("")
    if (!isSupabaseConfigured()) {
      onError("Sign-in is temporarily unavailable. Please try again later.")
      return
    }

    setBusy(true)
    try {
      const supabase = createClient()
      const redirectTo = `${window.location.origin}/auth/callback?next=/account`
      const { error } = await supabase.auth.signInWithOAuth({
        provider: "google",
        options: { redirectTo },
      })
      if (error) throw error
    } catch (error) {
      logAuthDiagnostic("google-start", error)
      onError(authErrorMessage(error))
      setBusy(false)
    }
  }

  return (
    <Button type="button" variant="outline" size="lg" className="google-sign-in" disabled={busy} onClick={signIn}>
      <span aria-hidden="true">G</span>
      <AppLoader active={busy} label="Opening Google sign-in" />
      {busy ? "Redirecting…" : "Continue with Google"}
    </Button>
  )
}
