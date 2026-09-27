"use client"

import { useEffect, useRef, useState } from "react"
import { Button } from "@/components/ui/button"

export function EmailPreferences() {
  const [enabled, setEnabled] = useState<boolean | null>(null)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState("")
  const [notice, setNotice] = useState("")
  const [reload, setReload] = useState(0)
  const pending = useRef(false)
  useEffect(() => {
    let active = true
    void fetch("/api/communication-preferences", { cache: "no-store" }).then(async response => {
      if (!response.ok) throw Error()
      const result = await response.json() as { emailOffers: boolean }
      if (active) { setEnabled(result.emailOffers); setError("") }
    }).catch(() => { if (active) setError("Email preferences could not be loaded.") })
    return () => { active = false }
  }, [reload])
  async function save(next: boolean) {
    if (pending.current) return
    pending.current = true; setBusy(true); setError(""); setNotice("")
    try {
      const response = await fetch("/api/communication-preferences", { method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ emailOffers: next }) })
      if (!response.ok) throw Error()
      const result = await response.json() as { emailOffers: boolean }
      setEnabled(result.emailOffers)
      setNotice(result.emailOffers ? "Restaurant offer emails enabled." : "Unsubscribed from restaurant offer emails.")
    } catch { setError("Your preference was not confirmed. Please retry.") }
    finally { pending.current = false; setBusy(false) }
  }
  return <section id="communications" className="account-section" aria-labelledby="email-preferences-title">
    <h2 id="email-preferences-title">Restaurant emails</h2>
    <p>Choose whether this restaurant may email you offers. Order receipts and sign-in codes are separate.</p>
    <label className="field-checkbox"><input type="checkbox" checked={enabled === true} disabled={busy || enabled === null} onChange={event => void save(event.target.checked)} />Receive restaurant offers by email</label>
    {busy && <p role="status">Saving preference…</p>}
    {enabled === null && !error && <p role="status">Loading email preference…</p>}
    {error && <p role="alert">{error} {enabled === null && <Button variant="outline" onClick={() => setReload(value => value + 1)}>Retry</Button>}</p>}
    {notice && <p role="status">{notice}</p>}
  </section>
}
