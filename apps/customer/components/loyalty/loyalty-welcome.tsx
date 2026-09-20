"use client"

import Link from "next/link"
import { Coins, X } from "lucide-react"
import { AnimatePresence, motion } from "motion/react"
import { useCallback, useEffect, useState } from "react"
import { useApp } from "@/components/providers/app-provider"
import { createClient } from "@/lib/supabase/client"
import type { LoyaltyWalletSnapshot } from "@/lib/loyalty/types"
import { useHydrationSafeReducedMotion } from "@/lib/motion/use-hydration-safe-reduced-motion"

export function LoyaltyWelcome() {
  const { authResolved, authUserId, storefront } = useApp()
  const reduceMotion = useHydrationSafeReducedMotion()
  const [wallet,setWallet]=useState<LoyaltyWalletSnapshot|null>(null)
  const [visible,setVisible]=useState(false)
  const load=useCallback(async()=>{if(!authUserId||!storefront.business.id)return;const response=await fetch("/api/loyalty",{cache:"no-store"});if(!response.ok)return;const result=await response.json() as {wallet:LoyaltyWalletSnapshot};const next=result.wallet;setWallet(next);const latest=next.transactions.find(transaction=>transaction.transaction_type==="EARN");if(!next.enabled||!next.showEarningMessage||!latest)return;const key=`ip-loyalty-seen-${storefront.business.id}-${authUserId}`;if(window.localStorage.getItem(key)!==latest.id){window.localStorage.setItem(key,latest.id);setVisible(true)}},[authUserId,storefront.business.id])
  useEffect(()=>{if(authResolved&&authUserId)void Promise.resolve().then(load)},[authResolved,authUserId,load])
  useEffect(()=>{if(!authUserId)return;const supabase=createClient();const channel=supabase.channel(`customer-loyalty-${authUserId}`).on("postgres_changes",{event:"INSERT",schema:"public",table:"loyalty_transactions",filter:`customer_id=eq.${authUserId}`},()=>void load()).subscribe();return()=>{void supabase.removeChannel(channel)}},[authUserId,load])
  if(!authUserId)return null
  const latestEarn=wallet?.transactions.find(transaction=>transaction.transaction_type==="EARN")
  return <AnimatePresence>{visible&&wallet&&latestEarn&&<motion.aside className="loyalty-earned-toast" role="status" initial={reduceMotion?false:{opacity:0,y:-18,scale:.96}} animate={{opacity:1,y:0,scale:1}} exit={reduceMotion?{opacity:0}:{opacity:0,y:-10}}><button aria-label="Close reward message" onClick={()=>setVisible(false)}><X/></button><span><Coins/></span><div><small>{wallet.programName.toUpperCase()}</small><strong>You earned {latestEarn.coins} {wallet.coinName}!</strong><p>Your wallet now has <b>{wallet.balanceCoins} coins</b> worth <b>Rs {wallet.balancePkr.toLocaleString("en-PK")}</b>.</p><Link href="/account#loyalty" onClick={()=>setVisible(false)}>View my wallet</Link></div></motion.aside>}</AnimatePresence>
}
