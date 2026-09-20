"use client"

import { AnimatePresence, motion, useReducedMotion } from "motion/react"
import type { User } from "@supabase/supabase-js"
import { useState } from "react"

import { EmailSignInForm } from "@/components/account/email-sign-in-form"
import { GoogleSignInButton } from "@/components/account/google-sign-in-button"
import { OtpVerificationForm } from "@/components/account/otp-verification-form"
import { BrandLogo } from "@/components/brand/brand-logo"
import { useApp } from "@/components/providers/app-provider"

type SignInCardProps = {
  initialError?: string
  onSignedIn: (user: User) => void
}

export function SignInCard({ initialError = "", onSignedIn }: SignInCardProps) {
  const { storefront } = useApp()
  const [email, setEmail] = useState("")
  const [message, setMessage] = useState(initialError)
  const reduceMotion = useReducedMotion()

  return (
    <section className="sign-in-card" aria-labelledby="sign-in-title">
      <div className="sign-in-brand"><BrandLogo logoUrl={storefront.business.logoUrl ?? undefined} brandName={`${storefront.business.displayName} ACCOUNT`} size="sm" /></div>
      <AnimatePresence mode="wait" initial={false}>
        <motion.div
          key={email ? "otp" : "signin"}
          initial={reduceMotion ? false : { opacity: 0, y: 8 }}
          animate={{ opacity: 1, y: 0 }}
          exit={reduceMotion ? undefined : { opacity: 0, y: -8 }}
          transition={{ duration: 0.18 }}
        >
          {email ? (
            <OtpVerificationForm
              email={email}
              onChangeEmail={() => { setEmail(""); setMessage("") }}
              onError={setMessage}
              onVerified={onSignedIn}
            />
          ) : (
            <>
              <h1 id="sign-in-title">Sign in to {storefront.business.name}</h1>
              <p>Use Google or a secure one-time email code. No password needed.</p>
              <GoogleSignInButton onError={setMessage} />
              <div className="sign-in-divider"><span>or</span></div>
              <EmailSignInForm onCodeSent={(value) => { setEmail(value); setMessage("") }} onError={setMessage} />
            </>
          )}
        </motion.div>
      </AnimatePresence>
      {message && <p className="auth-message auth-message--error" role="alert">{message}</p>}
      {!email && <p className="auth-privacy">By continuing, you agree to receive an authentication email needed to sign you in.</p>}
    </section>
  )
}
