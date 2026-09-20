"use client"

import type { User } from "@supabase/supabase-js"
import { useEffect, useState } from "react"
import { AppLoader } from "@italian-pizza/shared/app-loader"

import { AuthenticatedAccount } from "@/components/account/authenticated-account"
import { SignInCard } from "@/components/account/sign-in-card"
import { MobileBottomNav } from "@/components/layout/mobile-bottom-nav"
import { SiteHeader } from "@/components/layout/site-header"
import { logAuthDiagnostic } from "@/lib/auth/errors"
import { createClient } from "@/lib/supabase/client"

type AccountPageProps = {
  initialUser: User | null
  initialError?: string
}

export function AccountPage({ initialUser, initialError }: AccountPageProps) {
  const [user, setUser] = useState<User | null>(initialUser)
  const [authResolved, setAuthResolved] = useState(Boolean(initialUser))

  useEffect(() => {
    const supabase = createClient()
    const { data: listener } = supabase.auth.onAuthStateChange((_event, session) => {
      setUser(session?.user ?? null)
      setAuthResolved(true)
    })

    void supabase.auth.getUser().then(({ data, error }) => {
      if (error && error.name !== "AuthSessionMissingError") logAuthDiagnostic("restore-user", error)
      setUser(data.user ?? null)
      setAuthResolved(true)
    }).catch(() => setAuthResolved(true))

    return () => listener.subscription.unsubscribe()
  }, [initialUser])

  return (
    <div className="app-shell inner-page account-page">
      <SiteHeader />
      <main className="account-main">
        {!authResolved ? <div className="account-loading tracking-loading" role="status" aria-live="polite"><AppLoader active delay={0} label="Loading your account" /><span>Loading your account…</span></div> : user ? <AuthenticatedAccount key={user.id} user={user} onSignedOut={() => setUser(null)} /> : <SignInCard initialError={initialError} onSignedIn={(nextUser) => { setUser(nextUser); setAuthResolved(true) }} />}
      </main>
      <MobileBottomNav />
    </div>
  )
}
