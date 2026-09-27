"use client"

import Image from "next/image"
import Link from "next/link"
import { Coins, Crown, Gift, Heart, LogOut, MapPin, PackageCheck, UserRound } from "lucide-react"
import type { User } from "@supabase/supabase-js"
import { AppLoader } from "@italian-pizza/shared/app-loader"
import { useEffect, useMemo, useState, type FormEvent } from "react"

import { Button } from "@/components/ui/button"
import { useApp } from "@/components/providers/app-provider"
import { authErrorMessage, logAuthDiagnostic } from "@/lib/auth/errors"
import { subscribeToLocalOrders, type LocalOrder } from "@/lib/orders/local-orders"
import { fetchRemoteOrders } from "@/lib/orders/remote-orders"
import { createClient } from "@/lib/supabase/client"
import type { LoyaltyWalletSnapshot } from "@/lib/loyalty/types"
import { PushPreferences } from "@/components/notifications/push-preferences"
import { unsubscribeBrowserPush } from "@/lib/notifications/browser"
import { EmailPreferences } from "@/components/notifications/email-preferences"

function profileFor(user: User) {
  const metadata = user.user_metadata ?? {}
  const name = String(metadata.full_name ?? metadata.name ?? "").trim() || user.email?.split("@")[0] || "Customer"
  const avatar = typeof metadata.avatar_url === "string" ? metadata.avatar_url : typeof metadata.picture === "string" ? metadata.picture : null
  const provider = user.app_metadata?.provider === "google" ? "Google" : "Email code"
  const initials = name.split(/\s+/).slice(0, 2).map((part) => part[0]).join("").toUpperCase()
  return { name, avatar, provider, initials }
}

export function AuthenticatedAccount({ user, onSignedOut }: { user: User; onSignedOut: () => void }) {
  const { savedAddresses, openLocation } = useApp()
  const [orders, setOrders] = useState<LocalOrder[]>([])
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState("")
  const [profileData, setProfileData] = useState({ fullName: "", phone: "", gender: "", dateOfBirth: "" })
  const [favourites, setFavourites] = useState<Array<{ product_id: string; products?: { name?: string; is_available?: boolean } | null }>>([])
  const [loyalty,setLoyalty]=useState<LoyaltyWalletSnapshot|null>(null)
  const [detailPanel, setDetailPanel] = useState<"addresses" | "favourites" | "loyalty" | null>(null)
  const [profileMessage, setProfileMessage] = useState("")
  const [savingProfile, setSavingProfile] = useState(false)
  const profile = useMemo(() => profileFor(user), [user])

  useEffect(() => {
    let active = true
    const refresh = async () => {
      const remote = await fetchRemoteOrders().catch(() => [])
      if (active) setOrders(remote)
    }
    void refresh()
    const unsubscribe = subscribeToLocalOrders(() => { void refresh() })
    return () => { active = false; unsubscribe() }
  }, [])

  useEffect(() => {
    let active = true
    void Promise.all([fetch("/api/profile", { cache: "no-store" }), fetch("/api/favourites", { cache: "no-store" }),fetch("/api/loyalty",{cache:"no-store"})]).then(async ([profileResponse, favouritesResponse,loyaltyResponse]) => {
      const profile = profileResponse.ok ? await profileResponse.json() as { profile?: { full_name?: string | null; phone?: string | null; gender?: string | null; date_of_birth?: string | null } } : {}
      const favouriteResult = favouritesResponse.ok ? await favouritesResponse.json() as { favourites?: Array<{ product_id: string; products?: { name?: string; is_available?: boolean } | null }> } : {}
      const loyaltyResult=loyaltyResponse.ok?await loyaltyResponse.json() as {wallet?:LoyaltyWalletSnapshot}:{}
      if (active) {
        setProfileData({ fullName: profile.profile?.full_name ?? profileFor(user).name, phone: profile.profile?.phone ?? "", gender: profile.profile?.gender ?? "", dateOfBirth: profile.profile?.date_of_birth ?? "" })
        setFavourites(favouriteResult.favourites ?? [])
        setLoyalty(loyaltyResult.wallet??null)
      }
    }).catch(() => undefined)
    return () => { active = false }
  }, [user])

  useEffect(() => {
    const syncHash = () => {
      if (window.location.hash === "#addresses") setDetailPanel("addresses")
      if (window.location.hash === "#favourites") setDetailPanel("favourites")
      if (window.location.hash === "#loyalty") setDetailPanel("loyalty")
    }
    syncHash()
    window.addEventListener("hashchange", syncHash)
    return () => window.removeEventListener("hashchange", syncHash)
  }, [])

  const updateProfile = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault(); setSavingProfile(true); setProfileMessage("")
    try {
      const response = await fetch("/api/profile", { method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ fullName: profileData.fullName, phone: profileData.phone, gender: profileData.gender, dateOfBirth: profileData.dateOfBirth }) })
      const result = await response.json() as { error?: string }
      setProfileMessage(response.ok ? "Profile updated." : result.error ?? "Profile could not be updated.")
    } catch { setProfileMessage("Profile could not be updated.") } finally { setSavingProfile(false) }
  }

  const signOut = async () => {
    setBusy(true)
    setError("")
    try {
      await unsubscribeBrowserPush()
      const { error: signOutError } = await createClient().auth.signOut({ scope: "local" })
      if (signOutError) throw signOutError
      onSignedOut()
    } catch (signOutError) {
      logAuthDiagnostic("sign-out", signOutError)
      setError(authErrorMessage(signOutError))
    } finally {
      setBusy(false)
    }
  }

  return (
    <section className="account-dashboard" aria-labelledby="account-title">
      <PushPreferences settings />
      <EmailPreferences />
      <header className="account-profile">
        <div className="account-avatar" aria-hidden="true">
          {profile.avatar ? <Image src={profile.avatar} alt="" width={64} height={64} referrerPolicy="no-referrer" /> : <span>{profile.initials}</span>}
        </div>
        <div className="account-profile__copy">
          <span>SIGNED IN WITH {profile.provider.toUpperCase()}</span>
          <h1 id="account-title">{profileData.fullName || profile.name}</h1>
          <p>{user.email}</p>
        </div>
        <Button type="button" variant="outline" onClick={signOut} disabled={busy}>
          <AppLoader active={busy} label="Signing out" />
          <LogOut aria-hidden="true" /> {busy ? "Signing out…" : "Sign out"}
        </Button>
      </header>

      {error && <p className="auth-message auth-message--error" role="alert">{error}</p>}

      <section className="account-panel"><div className="account-panel__heading"><div><small>MY PROFILE</small><h2>Personal details</h2></div></div><form className="account-profile-form" onSubmit={(event) => void updateProfile(event)}><label>Full name<input value={profileData.fullName} onChange={(event) => setProfileData((value) => ({ ...value, fullName: event.target.value }))} autoComplete="name" /></label><label>Email<input value={user.email ?? ""} readOnly aria-describedby="account-email-note" /></label><label>Mobile number<input value={profileData.phone} onChange={(event) => setProfileData((value) => ({ ...value, phone: event.target.value }))} autoComplete="tel" /></label><label>Gender <span className="field-optional">Optional</span><input value={profileData.gender} onChange={(event) => setProfileData((value) => ({ ...value, gender: event.target.value }))} /></label><label>Date of birth <span className="field-optional">Optional</span><input type="date" value={profileData.dateOfBirth} onChange={(event) => setProfileData((value) => ({ ...value, dateOfBirth: event.target.value }))} /></label><div><Button type="submit" disabled={savingProfile}><AppLoader active={savingProfile} label="Saving profile"/>{savingProfile ? "Saving…" : "Update profile"}</Button>{profileMessage && <span role="status">{profileMessage}</span>}</div></form><small id="account-email-note">Your sign-in email cannot be changed here.</small></section>

      <div className="account-summary-grid">
        {loyalty?.enabled&&<button type="button" className="account-summary-card account-summary-card--button loyalty-summary-card" id="loyalty" onClick={()=>setDetailPanel(value=>value==="loyalty"?null:"loyalty")}><span><Coins aria-hidden="true"/></span><div><small>{loyalty.programName.toUpperCase()}</small><strong>{loyalty.balanceCoins} {loyalty.coinName}</strong><p>Worth Rs {loyalty.balancePkr.toLocaleString("en-PK")} · {loyalty.tier} tier</p></div></button>}
        <Link href="/orders" className="account-summary-card">
          <span><PackageCheck aria-hidden="true" /></span>
          <div><small>MY ORDERS</small><strong>{orders.length}</strong><p>Your signed-in order history</p></div>
        </Link>
        <button type="button" className="account-summary-card account-summary-card--button" id="addresses" onClick={() => setDetailPanel((value) => value === "addresses" ? null : "addresses")}>
          <span><MapPin aria-hidden="true" /></span>
          <div><small>SAVED ADDRESSES</small><strong>{savedAddresses.length}</strong><p>{savedAddresses.length ? savedAddresses.map((address) => address.label).join(" · ") : "No saved addresses yet"}</p><span className="account-inline-action">View addresses</span></div>
        </button>
        <button type="button" className="account-summary-card account-summary-card--button" id="favourites" onClick={() => setDetailPanel((value) => value === "favourites" ? null : "favourites")}><span><Heart aria-hidden="true" /></span><div><small>MY FAVOURITES</small><strong>{favourites.length}</strong><p>{favourites.length ? favourites.map((item) => item.products?.name).filter(Boolean).slice(0, 2).join(" · ") : "No favourites yet"}</p></div></button>
      </div>

      {detailPanel === "addresses" && <section className="account-detail-panel" aria-labelledby="saved-addresses-title"><div className="account-panel__heading"><small>SAVED ADDRESSES</small><h2 id="saved-addresses-title">Your saved delivery addresses</h2></div>{savedAddresses.length ? <div className="account-detail-list">{savedAddresses.map((address) => <article key={address.id} className="account-detail-row"><MapPin aria-hidden="true" /><div><strong>{address.label}</strong><p>{[address.addressLine1, address.addressLine2, address.landmark, address.city].filter(Boolean).join(", ")}</p></div></article>)}</div> : <p className="account-empty-detail">No saved addresses yet. Add one from checkout or location selection.</p>}<Button type="button" variant="outline" onClick={openLocation}>Add or manage address</Button></section>}
      {detailPanel === "favourites" && <section className="account-detail-panel" aria-labelledby="saved-favourites-title"><div className="account-panel__heading"><small>MY FAVOURITES</small><h2 id="saved-favourites-title">Food you saved</h2></div>{favourites.length ? <div className="account-detail-list">{favourites.map((item) => <article key={item.product_id} className="account-detail-row"><Heart aria-hidden="true" className="is-filled" /><div><strong>{item.products?.name ?? "Saved item"}</strong><p>{item.products?.is_available === false ? "Currently unavailable" : "Available to order"}</p></div></article>)}</div> : <p className="account-empty-detail">No favourites yet. Tap the heart on any menu item to save it.</p>}</section>}
      {detailPanel==="loyalty"&&loyalty?.enabled&&<section className="account-detail-panel loyalty-wallet-panel" aria-labelledby="loyalty-wallet-title"><div className="loyalty-wallet-hero"><span><Coins aria-hidden="true"/></span><div><small>{loyalty.programName.toUpperCase()}</small><h2 id="loyalty-wallet-title">{loyalty.balanceCoins} {loyalty.coinName}</h2><p>PKR wallet value: <strong>Rs {loyalty.balancePkr.toLocaleString("en-PK")}</strong></p></div><b className={`loyalty-customer-tier tier-${loyalty.tier.toLowerCase()}`}>{loyalty.tier==="VIP"&&<Crown/>}{loyalty.tier}</b></div><div className="loyalty-wallet-stats"><div><small>LIFETIME EARNED</small><strong>{loyalty.lifetimeEarned}</strong></div><div><small>DELIVERED ORDERS</small><strong>{loyalty.completedOrders}</strong></div><div><small>ONE COIN VALUE</small><strong>Rs {loyalty.coinValuePkr}</strong></div></div>{loyalty.nextTierAt&&<div className="loyalty-progress"><span><b>{loyalty.completedOrders}</b> of {loyalty.nextTierAt} delivered orders toward your next tier</span><i><b style={{width:`${Math.min(100,loyalty.completedOrders/loyalty.nextTierAt*100)}%`}}/></i></div>}<div className="loyalty-history"><h3><Gift/> Coin activity</h3>{loyalty.transactions.length?loyalty.transactions.map(transaction=><article key={transaction.id}><span><strong>{transaction.description}</strong><small>{new Date(transaction.created_at).toLocaleString("en-PK",{timeZone:"Asia/Karachi"})}</small></span><b className={transaction.coins>0?"is-credit":"is-debit"}>{transaction.coins>0?"+":""}{transaction.coins}</b></article>):<p>Your first coin entry will appear after an eligible order is delivered.</p>}</div><small className="loyalty-wallet-note">Use any available coins during checkout. Coins are earned only after eligible delivered orders, and coins spent on a cancelled order are returned automatically.</small></section>}

      <div className="account-local-note">
        <UserRound aria-hidden="true" />
        <p>Save your details once for faster checkout and keep every order in one place.</p>
      </div>
    </section>
  )
}
