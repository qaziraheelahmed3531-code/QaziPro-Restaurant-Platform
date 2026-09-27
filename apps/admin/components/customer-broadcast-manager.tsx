"use client"

import { Mail, Megaphone, RefreshCw, Send } from "lucide-react"
import { useRef, useState } from "react"

type Deal = { id: string; name: string; deal_price: number }
type Campaign = { id: string; subject: string; status: string; recipient_count: number; sent_count: number; failed_count: number; created_at: string }
type Progress = { id: string; status: string; sent: number; failed: number; remaining: number; processed?: number }

export function CustomerBroadcastManager({ deals, initialCampaigns }: { deals: Deal[]; initialCampaigns: Campaign[] }) {
  const [subject, setSubject] = useState("")
  const [message, setMessage] = useState("")
  const [dealId, setDealId] = useState("")
  const [campaigns, setCampaigns] = useState(initialCampaigns)
  const [busy, setBusy] = useState(false)
  const [notice, setNotice] = useState("")
  const pending = useRef(false)
  const draftRequest = useRef<{ fingerprint: string; id: string } | null>(null)

  async function deliver(id: string) {
    let result: Progress = { id, status: "SENDING", sent: 0, failed: 0, remaining: 1 }
    let batches = 0
    while (result.remaining > 0 && batches < 500) {
      const response = await fetch("/api/customer-broadcasts", { method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ id }) })
      const payload = await response.json() as Progress & { error?: string }
      if (!response.ok) throw new Error(payload.error || "Email delivery could not continue.")
      result = payload; batches += 1
      setCampaigns((current) => current.map((item) => item.id === id ? { ...item, status: payload.status, sent_count: payload.sent, failed_count: payload.failed } : item))
      setNotice(`Sending securely… ${result.sent} sent${result.failed ? `, ${result.failed} failed` : ""}.`)
      // Another worker may own the batch. Never spin hundreds of empty requests.
      if (result.remaining > 0 && result.processed === 0) break
    }
    setNotice(result.remaining > 0 ? `Delivery is still in progress. ${result.sent} sent so far. Check this campaign again shortly; do not create another copy.` : result.status === "SENT" ? `Message sent to ${result.sent} customers.` : `Completed: ${result.sent} sent and ${result.failed} could not be delivered.`)
  }

  async function send() {
    if (pending.current) return
    if (subject.trim().length < 3 || message.trim().length < 3) { setNotice("Add a clear subject and message first."); return }
    if (!window.confirm("Send this email individually to this restaurant's registered customers?")) return
    pending.current = true
    setBusy(true); setNotice("Preparing the secure recipient list…")
    try {
      const draft = { subject: subject.trim(), message: message.trim(), dealId: dealId || null }
      const fingerprint = JSON.stringify(draft)
      if (draftRequest.current?.fingerprint !== fingerprint) draftRequest.current = { fingerprint, id: crypto.randomUUID() }
      const response = await fetch("/api/customer-broadcasts", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ ...draft, requestId: draftRequest.current.id }) })
      const created = await response.json() as { id?: string; recipientCount?: number; error?: string }
      if (!response.ok || !created.id) throw new Error(created.error || "Message campaign could not be created.")
      const newCampaign: Campaign = { id: created.id, subject: subject.trim(), status: created.recipientCount ? "SENDING" : "SENT", recipient_count: created.recipientCount ?? 0, sent_count: 0, failed_count: 0, created_at: new Date().toISOString() }
      setCampaigns((current) => [newCampaign, ...current.filter(item => item.id !== created.id)].slice(0, 20))
      // Creation succeeded: retries must resume this campaign, not create another.
      draftRequest.current = null
      setSubject(""); setMessage(""); setDealId("")
      if (!created.recipientCount) { setNotice("No customers have opted into this restaurant's email offers yet. No email was sent."); return }
      await deliver(created.id)
    } catch (error) { setNotice(error instanceof Error ? error.message : "Message could not be sent.") }
    finally { pending.current = false; setBusy(false) }
  }

  async function resume(id: string) {
    if (pending.current) return
    pending.current = true
    setBusy(true); setNotice("Resuming secure delivery…")
    try { await deliver(id) } catch (error) { setNotice(error instanceof Error ? error.message : "Delivery could not resume.") }
    finally { pending.current = false; setBusy(false) }
  }

  return <section className="panel broadcast-manager">
    <div className="page-heading"><div><p className="eyebrow">CUSTOMER MESSAGING</p><h1>Email opted-in customers</h1><p>Send a private branded message to customers who chose email offers from this restaurant. Signing in alone never subscribes a customer.</p></div><Megaphone aria-hidden="true" /></div>
    <div className="broadcast-manager__layout">
      <div className="broadcast-composer">
        <label>Feature a deal (optional)<select disabled={busy} value={dealId} onChange={(event) => setDealId(event.target.value)}><option value="">No deal attached</option>{deals.map((deal) => <option value={deal.id} key={deal.id}>{deal.name} — Rs {Number(deal.deal_price).toLocaleString("en-PK")}</option>)}</select></label>
        <label>Email subject<input disabled={busy} maxLength={140} value={subject} onChange={(event) => setSubject(event.target.value)} placeholder="A fresh deal just landed" /></label>
        <label>Message<textarea disabled={busy} maxLength={2000} rows={5} value={message} onChange={(event) => setMessage(event.target.value)} placeholder="Tell your customers what is new and why they will love it." /></label>
        <button className="button" type="button" disabled={busy} onClick={() => void send()}><Send aria-hidden="true" />{busy ? "Sending…" : "Send to all eligible customers"}</button>
        <small>Emails are sent one-by-one. Recipient addresses are never exposed to other customers.</small>
        {notice && <p className="inline-notice" role="status">{notice}</p>}
      </div>
      <div className="broadcast-history"><h2><Mail aria-hidden="true"/> Recent messages</h2>{campaigns.length ? campaigns.map((item) => <article key={item.id}><div><strong>{item.subject}</strong><small>{new Date(item.created_at).toLocaleString("en-PK")}</small></div><div><span data-status={item.status}>{item.status}</span><small>{item.sent_count}/{item.recipient_count} sent{item.failed_count ? ` · ${item.failed_count} failed` : ""}</small></div>{["PENDING", "SENDING", "PARTIAL", "FAILED"].includes(item.status) && <button type="button" className="button button--outline" disabled={busy} onClick={() => void resume(item.id)}><RefreshCw aria-hidden="true"/> Resume</button>}</article>) : <p className="state-box">No customer messages have been created yet.</p>}</div>
    </div>
  </section>
}
