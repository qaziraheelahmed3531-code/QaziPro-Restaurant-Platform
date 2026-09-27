"use client"

import { useEffect, useRef, useState } from "react"
import { Bell } from "lucide-react"
import { useApp } from "@/components/providers/app-provider"
import { browserDeviceId, unsubscribeBrowserPush } from "@/lib/notifications/browser"

export function PushPreferences({ settings=false }: {settings?:boolean}) {
  const { authUserId,storefront,cartCount }=useApp()
  const [state,setState]=useState<"hidden"|"ready"|"subscribed"|"blocked"|"unsupported"|"unconfigured">("hidden")
  const [key,setKey]=useState("")
  const [marketing,setMarketing]=useState(false)
  const [busy,setBusy]=useState(false)
  const [error,setError]=useState("")
  const pending=useRef(false)
  const dismissKey=`qp-push-dismissed:${storefront.business.id}`
  useEffect(()=>{
    if(!authUserId || (!settings && cartCount===0))return
    let active=true
    async function restore(){
      if(!("serviceWorker" in navigator) || !("PushManager" in window) || !("Notification" in window)){if(active)setState("unsupported");return}
      try {
        const response=await fetch("/api/push",{cache:"no-store"});if(!response.ok)throw Error()
        const config=await response.json() as {configured:boolean;publicKey:string}
        if(!active)return
        if(!config.configured){setState("unconfigured");return}
        setKey(config.publicKey)
        if(Notification.permission==="denied"){setState("blocked");return}
        const registration=await navigator.serviceWorker.getRegistration("/")
        const subscription=await registration?.pushManager.getSubscription()
        if(!active)return
        const owner=localStorage.getItem("qp-browser-push-owner")
        if(subscription && owner===`${storefront.business.id}:${authUserId}`){setState("subscribed");return}
        if(!settings && Number(localStorage.getItem(dismissKey)||0)>Date.now())return
        setState("ready")
      } catch { if(active && settings)setError("Notification settings could not be loaded. Reload to retry.") }
    }
    void restore();return()=>{active=false}
  },[authUserId,cartCount,dismissKey,settings,storefront.business.id])

  async function enable(){
    if(pending.current || !authUserId)return
    pending.current=true;setBusy(true);setError("")
    try {
      // Native permission is requested only from this explicit click handler.
      const permission=await Notification.requestPermission()
      if(permission!=="granted"){setState(permission==="denied"?"blocked":"ready");return}
      await navigator.serviceWorker.register("/sw.js",{scope:"/"})
      const registration=await navigator.serviceWorker.ready
      const bytes=Uint8Array.from(atob(key.replace(/-/g,"+").replace(/_/g,"/")),char=>char.charCodeAt(0))
      const existing=await registration.pushManager.getSubscription()
      const subscription=existing ?? await registration.pushManager.subscribe({userVisibleOnly:true,applicationServerKey:bytes})
      const response=await fetch("/api/push",{method:"POST",headers:{"Content-Type":"application/json"},body:JSON.stringify({deviceId:browserDeviceId(),subscription:subscription.toJSON(),marketing})})
      if(!response.ok)throw Error("Subscription could not be saved. Try again; permission alone does not enable delivery.")
      localStorage.setItem("qp-browser-push-owner",`${storefront.business.id}:${authUserId}`)
      setState("subscribed")
    } catch(error){setError(error instanceof Error?error.message:"Notifications could not be enabled.")}
    finally{pending.current=false;setBusy(false)}
  }
  async function disable(){
    if(pending.current)return
    pending.current=true;setBusy(true);setError("")
    try{await unsubscribeBrowserPush();setState("ready");setMarketing(false)}
    catch {setError("Notifications could not be disabled. Please retry.")}
    finally{pending.current=false;setBusy(false)}
  }
  if(!authUserId || (!settings && state!=="ready"))return null
  return <section className={settings?"push-preferences":"push-soft-prompt"} aria-label="Browser notifications"><Bell aria-hidden="true"/><div><h2>{settings?"Browser notifications":"Keep up with your order"}</h2>
    <p>{state==="blocked"?"Notifications are blocked. You can allow them in your browser's site settings.":state==="unsupported"?"This browser doesn't support push here. On iPhone, use the website from your Home Screen.":state==="unconfigured"?"Browser notifications are being configured. Order tracking is still available.":state==="subscribed"?"This browser is subscribed to your private order updates.":"Get order updates from this restaurant, even when this tab is closed."}</p>
    {state==="ready" && <><label><input type="checkbox" checked={marketing} onChange={event=>setMarketing(event.target.checked)} disabled={busy}/>Also receive restaurant offers (optional)</label><div><button type="button" disabled={busy || !key} onClick={()=>void enable()}>{busy?"Enabling…":"Enable notifications"}</button>{!settings && <button type="button" disabled={busy} onClick={()=>{try{localStorage.setItem(dismissKey,String(Date.now()+30*86400000))}catch{}setState("hidden")}}>Not now</button>}</div></>}
    {settings && state==="subscribed" && <button type="button" disabled={busy} onClick={()=>void disable()}>{busy?"Unsubscribing…":"Unsubscribe this browser"}</button>}
    {error && <p role="alert">{error}</p>}
  </div></section>
}
