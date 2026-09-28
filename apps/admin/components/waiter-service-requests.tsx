"use client"

import { useCallback, useEffect, useRef, useState } from "react"
import { createClient } from "@/lib/supabase/client"

export type WaiterCallRow = { id: string; status: "PENDING" | "ACKNOWLEDGED"; created_at: string; restaurant_tables: { name: string } | { name: string }[] | null }

export function WaiterServiceRequests({ businessId, branchId, initialRequests, initialError }: { businessId: string; branchId: string; initialRequests: WaiterCallRow[]; initialError: boolean }) {
  const [requests, setRequests] = useState<WaiterCallRow[]>(initialRequests)
  const [error, setError] = useState(initialError ? "Waiter requests couldn't be loaded. Try again." : "")
  const [busyId, setBusyId] = useState("")
  const [refreshing, setRefreshing] = useState(false)
  const pending = useRef(false)
  const mounted = useRef(true)
  const currentRefresh = useRef<Promise<void> | null>(null)
  const refresh = useCallback(async () => {
    if (currentRefresh.current) return currentRefresh.current
    const load = async () => {
      try {
        const { data, error: loadError } = await createClient().from("restaurant_table_service_requests")
          .select("id,status,created_at,restaurant_tables(name)").eq("business_id", businessId).eq("branch_id", branchId)
          .in("status", ["PENDING", "ACKNOWLEDGED"]).order("created_at", { ascending: true })
          .abortSignal(AbortSignal.timeout(12_000))
        if (loadError) throw loadError
        if (mounted.current) { setRequests((data ?? []) as WaiterCallRow[]); setError("") }
      } catch {
        if (mounted.current) setError("Waiter requests couldn't be refreshed. Your last loaded calls are still shown. Try again.")
      }
    }
    currentRefresh.current = load()
    try { await currentRefresh.current }
    finally { currentRefresh.current = null }
  }, [businessId, branchId])

  useEffect(() => {
    mounted.current = true
    const client = createClient()
    const channel = client.channel(`waiter-calls:${businessId}:${branchId}`)
      .on("postgres_changes", { event: "*", schema: "public", table: "restaurant_table_service_requests", filter: `branch_id=eq.${branchId}` }, () => { void refresh() })
      .subscribe()
    const interval = window.setInterval(() => { if (document.visibilityState === "visible") void refresh() }, 20_000)
    const onFocus = () => { if (document.visibilityState === "visible") void refresh() }
    window.addEventListener("focus", onFocus)
    return () => { mounted.current = false; window.clearInterval(interval); window.removeEventListener("focus", onFocus); void client.removeChannel(channel) }
  }, [businessId, branchId, refresh])

  async function manualRefresh() {
    if (refreshing) return
    setRefreshing(true)
    try { await refresh() }
    finally { if (mounted.current) setRefreshing(false) }
  }

  async function respond(id: string, action: "ACKNOWLEDGE" | "COMPLETE") {
    if (pending.current) return
    pending.current = true; setBusyId(id); setError("")
    try {
      const { data, error: mutationError } = await createClient().rpc("respond_to_table_waiter_request", { p_request_id: id, p_action: action })
        .abortSignal(AbortSignal.timeout(12_000))
      if (mutationError || data?.id !== id || !["ACKNOWLEDGED", "COMPLETED"].includes(data.status)) throw mutationError ?? new Error("Invalid response")
      // Finish any older snapshot before applying the authoritative mutation.
      await currentRefresh.current
      if (mounted.current) setRequests(rows => data.status === "COMPLETED" ? rows.filter(row => row.id !== id) : rows.map(row => row.id === id ? { ...row, status: "ACKNOWLEDGED" } : row))
      await refresh()
    } catch { if (mounted.current) setError("Couldn't confirm the update. Refresh this list before trying again.") }
    finally { pending.current = false; if (mounted.current) setBusyId("") }
  }

  return <section className="panel waiter-service-requests" aria-label="Table waiter calls">
    <div className="panel-header"><div><h2>Table calls</h2><p>Guests requesting a waiter at this branch.</p><span role="status" aria-live="polite" aria-atomic="true">{requests.length ? `${requests.length} open table ${requests.length === 1 ? "call" : "calls"}` : ""}</span></div><button type="button" className="button button--outline" disabled={refreshing || Boolean(busyId)} onClick={() => void manualRefresh()}>{refreshing ? "Refreshing…" : "Refresh"}</button></div>
    {error && <p className="inline-notice is-error" role="alert">{error}</p>}
    {requests.length === 0 ? !error && <p>No table calls waiting.</p> : <ul className="waiter-call-list">{requests.map(request => {
      const table = Array.isArray(request.restaurant_tables) ? request.restaurant_tables[0] : request.restaurant_tables
      return <li key={request.id}><div><strong>{table?.name ?? "Dining table"}</strong><span>{request.status === "ACKNOWLEDGED" ? "Acknowledged" : "Needs a waiter"}</span></div><div className="waiter-call-actions">{request.status === "PENDING" && <button type="button" className="button button--outline" disabled={Boolean(busyId)} onClick={() => void respond(request.id, "ACKNOWLEDGE")}>{busyId === request.id ? "Updating…" : "Acknowledge"}</button>}<button type="button" className="button" disabled={Boolean(busyId)} onClick={() => void respond(request.id, "COMPLETE")}>{busyId === request.id ? "Updating…" : "Complete"}</button></div></li>
    })}</ul>}
  </section>
}
