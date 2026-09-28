"use client"

import { useEffect, useRef, useState } from "react"
import { useApp } from "@/components/providers/app-provider"

export function TableContextBanner() {
  const { storefront } = useApp()
  const [confirm, setConfirm] = useState(false)
  const [leaving, setLeaving] = useState(false)
  const [calling, setCalling] = useState(false)
  const [callState, setCallState] = useState<"idle" | "sent" | "error">("idle")
  const [callError, setCallError] = useState("")
  const callPending = useRef(false)
  useEffect(() => {
    if (callState !== "sent") return
    const timer = window.setTimeout(() => setCallState("idle"), 120_000)
    return () => window.clearTimeout(timer)
  }, [callState])
  if (!storefront.tableContext) return null
  async function callWaiter() {
    if (callPending.current || callState === "sent") return
    callPending.current = true
    setCalling(true); setCallState("idle"); setCallError("")
    try {
      const response = await fetch("/api/table-call-waiter", { method: "POST", signal: AbortSignal.timeout(12_000) })
      const result = await response.json() as { error?: string; status?: string }
      if (!response.ok) {
        setCallError(result.error || "We couldn't call a waiter. Please try again.")
        setCallState("error")
        return
      }
      if (!result.status || !["PENDING", "ACKNOWLEDGED"].includes(result.status)) throw new Error("Request not confirmed")
      setCallState("sent")
    } catch {
      setCallError("We couldn't confirm your request. Check your connection and try again.")
      setCallState("error")
    } finally { callPending.current = false; setCalling(false) }
  }
  return <section className="table-context-banner" aria-label="Your dining table">
    <div><small>DINING AT</small><strong>{storefront.tableContext.name}</strong><span>{storefront.branch.name}</span></div>
    {storefront.tableContext.waiterCallEnabled && <div className="table-context-call"><button type="button" disabled={calling || callState === "sent"} onClick={() => void callWaiter()}>{calling ? "Calling…" : callState === "sent" ? "Request sent" : "Call a waiter"}</button>{callState === "error" && <span role="alert">{callError}</span>}<span role="status" className="sr-only">{callState === "sent" ? "Your table request has been sent to the waiter portal." : ""}</span></div>}
    {confirm ? <form action="/api/table-context" method="post" onSubmit={() => setLeaving(true)}><p>Your table cart stays saved separately.</p><button type="submit" disabled={leaving}>{leaving ? "Leaving…" : "Leave dine-in"}</button><button type="button" disabled={leaving} onClick={() => setConfirm(false)}>Keep table</button></form> : <button type="button" onClick={() => setConfirm(true)}>Change order mode</button>}
  </section>
}
