"use client"

import { useState } from "react"
import { useApp } from "@/components/providers/app-provider"

export function TableContextBanner() {
  const { storefront } = useApp()
  const [confirm, setConfirm] = useState(false)
  const [leaving, setLeaving] = useState(false)
  const [calling, setCalling] = useState(false)
  const [callState, setCallState] = useState<"idle" | "sent" | "error">("idle")
  const [callError, setCallError] = useState("")
  if (!storefront.tableContext) return null
  async function callWaiter() {
    if (calling || callState === "sent") return
    setCalling(true); setCallState("idle"); setCallError("")
    try {
      const response = await fetch("/api/table-call-waiter", { method: "POST", headers: { "Content-Type": "application/json" } })
      const result = await response.json() as { error?: string }
      if (!response.ok) throw new Error(result.error || "Please try again.")
      setCallState("sent")
    } catch (error) {
      setCallError(error instanceof Error ? error.message : "Please try again.")
      setCallState("error")
    } finally { setCalling(false) }
  }
  return <section className="table-context-banner" aria-label="Your dining table">
    <div><small>DINING AT</small><strong>{storefront.tableContext.name}</strong><span>{storefront.branch.name}</span></div>
    {storefront.tableContext.waiterCallEnabled && <div className="table-context-call"><button type="button" disabled={calling || callState === "sent"} onClick={() => void callWaiter()}>{calling ? "Calling…" : callState === "sent" ? "Waiter notified" : "Call a waiter"}</button>{callState === "error" && <span role="alert">{callError}</span>}<span role="status" className="sr-only">{callState === "sent" ? "Your waiter has been notified." : ""}</span></div>}
    {confirm ? <form action="/api/table-context" method="post" onSubmit={() => setLeaving(true)}><p>Your table cart stays saved separately.</p><button type="submit" disabled={leaving}>{leaving ? "Leaving…" : "Leave dine-in"}</button><button type="button" disabled={leaving} onClick={() => setConfirm(false)}>Keep table</button></form> : <button type="button" onClick={() => setConfirm(true)}>Change order mode</button>}
  </section>
}
