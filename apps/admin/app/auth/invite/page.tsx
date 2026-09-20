"use client"

import { useEffect, useRef, useState } from "react"
import Link from "next/link"
import { createClient } from "@/lib/supabase/client"

/** Handles the default Supabase invitation redirect. URL credentials stay in-browser. */
export default function InvitationPage() {
  const started = useRef(false)
  const [error, setError] = useState("")
  useEffect(() => {
    if (started.current) return
    started.current = true
    const search = new URLSearchParams(window.location.search)
    const fragment = new URLSearchParams(window.location.hash.slice(1))
    const accessToken = fragment.get("access_token")
    const refreshToken = fragment.get("refresh_token")
    const businessId = search.get("business")
    const branchId = search.get("branch")
    window.history.replaceState(null, "", "/auth/invite")
    async function accept() {
      if (!accessToken || !refreshToken) { setError("This invitation is incomplete or expired. Ask an owner to resend it, or sign in with the invited email."); return }
      const client = createClient()
      const { error: sessionError } = await client.auth.setSession({ access_token: accessToken, refresh_token: refreshToken })
      if (sessionError) { setError("The invitation could not be verified. Please request a new invitation."); return }
      const { error: claimError } = await client.rpc("claim_staff_invitations")
      if (claimError) { setError("Your sign-in was verified, but restaurant access could not be activated. Ask the owner to resend the invitation."); return }
      if (businessId) document.cookie = `ip-admin-business=${encodeURIComponent(businessId)}; Path=/; SameSite=Lax; Max-Age=31536000`
      if (branchId) document.cookie = `ip-admin-branch=${encodeURIComponent(branchId)}; Path=/; SameSite=Lax; Max-Age=31536000`
      // The completion route rechecks the claimed membership and exact saved grants.
      window.location.replace("/auth/complete")
    }
    void accept().catch(() => setError("Could not verify this invitation. Check your connection and sign in again."))
  }, [])
  return <main className="login-card"><h1>Staff invitation</h1>{error ? <><p role="alert">{error}</p><Link href="/login">Sign in</Link></> : <p role="status">Verifying your invitation…</p>}</main>
}
