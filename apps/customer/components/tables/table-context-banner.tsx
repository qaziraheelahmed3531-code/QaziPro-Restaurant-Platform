"use client"

import { useState } from "react"
import { useApp } from "@/components/providers/app-provider"

export function TableContextBanner() {
  const { storefront } = useApp()
  const [confirm, setConfirm] = useState(false)
  const [leaving, setLeaving] = useState(false)
  if (!storefront.tableContext) return null
  return <section className="table-context-banner" aria-label="Your dining table">
    <div><small>DINING AT</small><strong>{storefront.tableContext.name}</strong><span>{storefront.branch.name}</span></div>
    {confirm ? <form action="/api/table-context" method="post" onSubmit={() => setLeaving(true)}><p>Your table cart stays saved separately.</p><button type="submit" disabled={leaving}>{leaving ? "Leaving…" : "Leave dine-in"}</button><button type="button" disabled={leaving} onClick={() => setConfirm(false)}>Keep table</button></form> : <button type="button" onClick={() => setConfirm(true)}>Change order mode</button>}
  </section>
}
