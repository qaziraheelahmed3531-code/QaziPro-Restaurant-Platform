"use client"

import { LogOut, ShieldAlert } from "lucide-react"
import { useRouter } from "next/navigation"
import { createClient } from "@/lib/supabase/client"

export function BlockedAccount({ restaurantName, contactHref }: { restaurantName: string; contactHref: string }) {
  const router = useRouter()
  return <main className="blocked-account"><section>
    <span className="blocked-account__icon"><ShieldAlert aria-hidden="true"/></span>
    <p className="eyebrow">{restaurantName}</p>
    <h1>Account access restricted</h1>
    <p>We&apos;re unable to accept orders from this account at the moment. Please contact the restaurant if you believe this is an error.</p>
    <div><a className="button-link" href={contactHref}>Contact restaurant</a><button className="button-link button-link--outline" type="button" onClick={async()=>{await createClient().auth.signOut({scope:"local"});router.replace("/")}}><LogOut aria-hidden="true"/>Sign out</button></div>
  </section></main>
}
