"use client"

import { useRef, useState } from "react"
import { createClient } from "@/lib/supabase/client"

type Row = { id: string; rating: number; comment: string; status: string; created_at: string; orderNumber: string | null }
export function OrderFeedbackManager({ businessId, branchId, initialRows }: { businessId: string; branchId: string; initialRows: Row[] }) {
  const [rows, setRows] = useState(initialRows)
  const [busy, setBusy] = useState("")
  const [error, setError] = useState("")
  const [onlyNew, setOnlyNew] = useState(false)
  const pending = useRef(false)
  async function review(id: string) {
    if (pending.current) return
    pending.current = true; setBusy(id); setError("")
    try {
      const { data, error } = await createClient().from("customer_order_feedback").update({ status: "REVIEWED" })
        .eq("id", id).eq("business_id", businessId).eq("branch_id", branchId).select("id").maybeSingle()
      if (error || !data) throw Error("save")
      setRows(current => current.map(row => row.id === id ? { ...row, status: "REVIEWED" } : row))
    } catch { setError("Feedback couldn't be marked reviewed. Check your access or connection and try again.") }
    finally { pending.current = false; setBusy("") }
  }
  const visible = onlyNew ? rows.filter(row => row.status === "NEW") : rows
  return <section className="panel" aria-label="Private order feedback"><div className="panel-header"><div><h2>Latest feedback</h2><p>Showing up to 100 recent responses. Ratings are from verified completed orders.</p></div><label><input type="checkbox" checked={onlyNew} onChange={event => setOnlyNew(event.target.checked)} /> New only</label></div>
    {error && <p role="alert" className="inline-notice is-error">{error}</p>}
    {!visible.length ? <div className="state-box"><h3>{onlyNew ? "You're up to date" : "No feedback yet"}</h3><p>Guests can leave feedback from the tracking page of their completed order.</p></div> : <div className="page-stack">{visible.map(row => <article className="panel" key={row.id}><div className="panel-header"><div><strong aria-label={`${row.rating} out of 5 stars`}>{"★".repeat(row.rating)}{"☆".repeat(5 - row.rating)}</strong><p>{row.orderNumber ? `Order ${row.orderNumber} · ` : "Completed order · "}<time dateTime={row.created_at}>{new Intl.DateTimeFormat("en-PK", { dateStyle: "medium", timeZone: "Asia/Karachi" }).format(new Date(row.created_at))}</time> · {row.status === "NEW" ? "New feedback" : "Reviewed"}</p></div>{row.status === "NEW" && <button className="button button--outline" type="button" disabled={Boolean(busy)} onClick={() => void review(row.id)}>{busy === row.id ? "Saving…" : "Mark reviewed"}</button>}</div><p style={{ whiteSpace: "pre-wrap", overflowWrap: "anywhere", padding: "0 20px 20px" }}>{row.comment || "The guest left a rating without a comment."}</p></article>)}</div>}
  </section>
}
