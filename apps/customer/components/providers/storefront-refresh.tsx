"use client"

import { useEffect } from "react"
import { useRouter } from "next/navigation"
import { createClient, isSupabaseConfigured } from "@/lib/supabase/client"

// Refresh server-owned content without discarding the current cart or checkout draft.
export function StorefrontRefresh({businessId,branchId}:{businessId:string;branchId:string}) {
  const router=useRouter()
  useEffect(()=>{
    if(!isSupabaseConfigured()||!businessId||!branchId)return
    let timer:ReturnType<typeof setTimeout>|undefined
    const refresh=()=>{if(document.visibilityState!=="visible")return;clearTimeout(timer);timer=setTimeout(()=>router.refresh(),300)}
    const client=createClient()
    let channel=client.channel(`storefront-content-${businessId}`)
    for(const table of ["business_branding","site_settings","social_links","footer_links","content_pages","branches","products","deals"])
      channel=channel.on("postgres_changes",{event:"*",schema:"public",table,filter:`business_id=eq.${businessId}`},refresh)
    for(const table of ["business_hours","delivery_rules","delivery_areas"])
      channel=channel.on("postgres_changes",{event:"*",schema:"public",table,filter:`branch_id=eq.${branchId}`},refresh)
    channel=channel.on("postgres_changes",{event:"UPDATE",schema:"public",table:"businesses",filter:`id=eq.${businessId}`},refresh)
    channel.subscribe()
    const reconcile=setInterval(refresh,60_000)
    document.addEventListener("visibilitychange",refresh)
    return()=>{clearTimeout(timer);clearInterval(reconcile);document.removeEventListener("visibilitychange",refresh);void client.removeChannel(channel)}
  },[businessId,branchId,router])
  return null
}
