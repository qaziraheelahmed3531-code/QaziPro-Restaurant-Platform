"use client"

import Link from "next/link"
import { ChevronDown, Coins, Heart, LogOut, MapPin, ReceiptText, ShoppingBag, UserRound } from "lucide-react"
import { AnimatePresence, motion } from "motion/react"
import { useEffect, useRef, useState } from "react"
import { useRouter } from "next/navigation"
import type { User } from "@supabase/supabase-js"

import { BrandLogo } from "@/components/brand/brand-logo"
import { useApp } from "@/components/providers/app-provider"
import { useHydrationSafeReducedMotion } from "@/lib/motion/use-hydration-safe-reduced-motion"
import { createClient } from "@/lib/supabase/client"

function AccountMenu() {
  const router = useRouter()
  const root = useRef<HTMLDivElement>(null)
  const [user, setUser] = useState<User | null>(null)
  const [open, setOpen] = useState(false)
  useEffect(() => {
    const supabase = createClient()
    void supabase.auth.getUser().then(({ data }) => setUser(data.user ?? null))
    const { data: listener } = supabase.auth.onAuthStateChange((_event, session) => setUser(session?.user ?? null))
    const outside = (event: MouseEvent) => { if (!root.current?.contains(event.target as Node)) setOpen(false) }
    const escape = (event: KeyboardEvent) => { if (event.key === "Escape") setOpen(false) }
    document.addEventListener("mousedown", outside); document.addEventListener("keydown", escape)
    return () => { listener.subscription.unsubscribe(); document.removeEventListener("mousedown", outside); document.removeEventListener("keydown", escape) }
  }, [])
  const name = String(user?.user_metadata?.full_name ?? user?.user_metadata?.name ?? user?.email?.split("@")[0] ?? "Account")
  const signOut = async () => { await createClient().auth.signOut({ scope: "local" }); setOpen(false); router.refresh() }
  if (!user) return <Link href="/account" className="nav-action"><UserRound aria-hidden="true" /><span>Account</span></Link>
  return <div ref={root} className="account-menu"><button type="button" className="nav-action" aria-haspopup="menu" aria-expanded={open} onClick={() => setOpen((value) => !value)}><UserRound aria-hidden="true" /><span>{name}</span><ChevronDown aria-hidden="true" /></button>{open && <div className="account-menu__popover" role="menu"><strong>{name}</strong><small>{user.email}</small><Link role="menuitem" href="/account" onClick={() => setOpen(false)}><UserRound aria-hidden="true" /> My Profile</Link><Link role="menuitem" href="/account#loyalty" onClick={() => setOpen(false)}><Coins aria-hidden="true" /> Loyalty Wallet</Link><Link role="menuitem" href="/orders" onClick={() => setOpen(false)}><ReceiptText aria-hidden="true" /> My Orders</Link><Link role="menuitem" href="/account#addresses" onClick={() => setOpen(false)}><MapPin aria-hidden="true" /> Saved Addresses</Link><Link role="menuitem" href="/account#favourites" onClick={() => setOpen(false)}><HeartIcon /> My Favourites</Link><button role="menuitem" type="button" onClick={() => void signOut()}><LogOutIcon /> Sign out</button></div>}</div>
}

function HeartIcon() { return <Heart aria-hidden="true" /> }
function LogOutIcon() { return <LogOut aria-hidden="true" /> }

function CartCount({ count }: { count: number }) {
  const reduceMotion = useHydrationSafeReducedMotion()
  if (count === 0) return null
  return (
    <AnimatePresence mode="popLayout">
      <motion.b key={count} initial={reduceMotion ? false : { scale: 0.72, opacity: 0 }} animate={{ scale: 1, opacity: 1 }} transition={{ duration: reduceMotion ? 0 : 0.18 }} aria-hidden="true">
        {count}
      </motion.b>
    </AnimatePresence>
  )
}

export function SiteHeader() {
  const { cartCount, locationLabel, openCart, openLocation, orderType, storefront } = useApp()
  const [lowerSection, setLowerSection] = useState(false)
  useEffect(() => {
    const section = document.getElementById("google-reviews")
    if (!section || typeof IntersectionObserver === "undefined") return
    const observer = new IntersectionObserver(([entry]) => setLowerSection(entry.isIntersecting), { threshold: 0.2 })
    observer.observe(section)
    return () => observer.disconnect()
  }, [])

  return (
    <header className={`site-header${lowerSection ? " is-lower-hidden" : ""}`} id="location">
      <div className="site-header__main">
        <div className="site-header__inner">
          <Link href="/" className="brand" aria-label={`${storefront.business.displayName} home`}>
            <BrandLogo logoUrl={storefront.business.logoUrl ?? undefined} brandName={storefront.business.displayName} placement="header" showName={false} />
          </Link>

          <button className="desktop-location" type="button" onClick={openLocation} disabled={orderType === "dine-in"} aria-label={`${orderType === "dine-in" ? "Dining at" : orderType === "delivery" ? "Deliver to" : "Pick up from"} ${locationLabel}`}>
            <MapPin aria-hidden="true" />
            <span><small>{orderType === "dine-in" ? "DINING AT" : orderType === "delivery" ? "DELIVER TO" : "PICK UP FROM"}</small><strong>{locationLabel}</strong></span>
            <ChevronDown aria-hidden="true" />
          </button>

          <nav className="desktop-actions" aria-label="Primary navigation">
            <Link href="/orders" className="nav-action"><ReceiptText aria-hidden="true" /><span>Orders</span></Link>
            <AccountMenu />
            <button type="button" className="nav-action nav-action--cart" aria-label={`Open cart with ${cartCount} items`} onClick={openCart}><ShoppingBag aria-hidden="true" /><span aria-hidden="true">Cart</span><CartCount count={cartCount} /></button>
          </nav>

          <div className="mobile-actions">
            <button type="button" className="mobile-icon-button" aria-label={`Open cart with ${cartCount} items`} onClick={openCart}><ShoppingBag aria-hidden="true" /><CartCount count={cartCount} /></button>
          </div>
        </div>
      </div>

      <button className="mobile-location" type="button" disabled={orderType === "dine-in"} onClick={openLocation}>
        <MapPin aria-hidden="true" />
        <span><small>{orderType === "dine-in" ? "Dining at" : orderType === "delivery" ? "Deliver to" : "Pick up from"}</small><strong>{locationLabel}</strong></span>
        <ChevronDown aria-hidden="true" />
      </button>
    </header>
  )
}
