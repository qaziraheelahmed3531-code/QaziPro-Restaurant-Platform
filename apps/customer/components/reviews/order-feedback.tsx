"use client"

import { useEffect, useRef, useState, type FormEvent } from "react"
import { CheckCircle2, Star } from "lucide-react"
import { Button } from "@/components/ui/button"
import { getOrderToken } from "@/lib/orders/remote-orders"

type Feedback = { rating: number; comment: string }
export function OrderFeedback({ orderNumber }: { orderNumber: string }) {
  const [state, setState] = useState<"loading" | "ready" | "saved" | "unavailable">("loading")
  const [rating, setRating] = useState(0)
  const [comment, setComment] = useState("")
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState("")
  const [retry, setRetry] = useState(0)
  const pending = useRef(false)
  const url = `/api/orders/${encodeURIComponent(orderNumber)}/feedback`
  useEffect(() => {
    const controller = new AbortController()
    const token = getOrderToken(orderNumber)
    void fetch(url, { headers: token ? { "X-Order-Token": token } : {}, signal: controller.signal, cache: "no-store" }).then(async response => {
      if (!response.ok) throw Error("unavailable")
      const result = await response.json() as { feedback?: Feedback; eligible: boolean }
      if (controller.signal.aborted) return
      setState(result.feedback ? "saved" : result.eligible ? "ready" : "unavailable")
    }).catch(() => { if (!controller.signal.aborted) setState("unavailable") })
    return () => controller.abort()
  }, [url, orderNumber, retry])
  async function submit(event: FormEvent) {
    event.preventDefault()
    if (pending.current) return
    if (!rating) { setError("Choose a star rating before sending."); return }
    pending.current = true; setBusy(true); setError("")
    try {
      const token = getOrderToken(orderNumber)
      const response = await fetch(url, { method: "POST", headers: { "Content-Type": "application/json", ...(token ? { "X-Order-Token": token } : {}) }, body: JSON.stringify({ rating, comment }) })
      if (!response.ok) throw Error("Your feedback couldn't be sent. Please try again; your words are still here.")
      setState("saved")
    } catch { setError("Your feedback couldn't be sent. Please try again; your words are still here.") }
    finally { pending.current = false; setBusy(false) }
  }
  if (state === "loading") return <section className="tracking-card feedback-card" role="status" aria-label="Loading feedback"><div className="feedback-skeleton skeleton-shimmer" /><div className="feedback-skeleton skeleton-shimmer" /></section>
  if (state === "unavailable") return <section className="tracking-card feedback-card"><h2>Your feedback</h2><p>Feedback is unavailable right now.</p><Button variant="outline" onClick={() => { setState("loading"); setRetry(value => value + 1) }}>Try again</Button></section>
  if (state === "saved") return <section className="tracking-card feedback-card" role="status"><CheckCircle2 aria-hidden="true" /><h2>Thank you for sharing.</h2><p>Your feedback has been sent privately to the restaurant team.</p></section>
  return <section className="tracking-card feedback-card" aria-labelledby="feedback-title"><h2 id="feedback-title">How was your order?</h2><p>A small note makes a difference. Your feedback goes privately to the restaurant team.</p>
    <form onSubmit={submit} aria-busy={busy}>
      <fieldset disabled={busy}><legend>Your rating</legend><div className="feedback-stars">{[1, 2, 3, 4, 5].map(value => <label key={value} className={rating >= value ? "is-selected" : ""}><input className="sr-only" type="radio" name="order-rating" value={value} checked={rating === value} onChange={() => { setRating(value); setError("") }} /><Star aria-hidden="true" /><span className="sr-only">{value} {value === 1 ? "star" : "stars"}</span></label>)}</div></fieldset>
      <label className="feedback-comment">Anything we should know? <span>Optional</span><textarea maxLength={2000} rows={4} value={comment} disabled={busy} onChange={event => setComment(event.target.value)} placeholder="Tell us about the food or your ordering experience." /></label>
      {error && <p role="alert">{error}</p>}<Button type="submit" disabled={busy}>{busy ? "Sending feedback…" : "Send feedback"}</Button>
    </form>
  </section>
}
