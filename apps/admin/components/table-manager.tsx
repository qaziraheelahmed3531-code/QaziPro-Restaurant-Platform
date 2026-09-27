"use client"

import { useRef, useState, type FormEvent } from "react"
import { LoaderCircle, Plus, Power, RefreshCw } from "lucide-react"
import { createClient } from "@/lib/supabase/client"
import { parseTableDraft } from "@/lib/table-draft"

type TableRow = { id: string; code: string; name: string; seats: number; is_active: boolean }
type Notice = { kind: "success" | "error"; text: string } | null
const columns = "id,code,name,seats,is_active"

export function TableManager({ businessId, branchId, initialTables, loadError = false }: {
  businessId: string; branchId: string; initialTables: TableRow[]; loadError?: boolean
}) {
  const [tables, setTables] = useState(initialTables)
  const [name, setName] = useState("")
  const [code, setCode] = useState("")
  const [seats, setSeats] = useState("4")
  const [busy, setBusy] = useState("")
  const [notice, setNotice] = useState<Notice>(null)
  const [unavailable, setUnavailable] = useState(loadError)
  const [confirmId, setConfirmId] = useState<string | null>(null)
  // State alone cannot stop two events fired before React commits a render.
  const pending = useRef(false)
  const nameInput = useRef<HTMLInputElement>(null)

  function start(action: string) {
    if (pending.current) return false
    pending.current = true
    setBusy(action)
    setNotice(null)
    return true
  }

  function finish() {
    pending.current = false
    setBusy("")
  }

  async function refresh() {
    if (!start("refresh")) return
    try {
      const { data, error } = await createClient().from("restaurant_tables").select(columns)
        .eq("business_id", businessId).eq("branch_id", branchId).order("name")
      if (error) throw error
      setTables(data ?? [])
      setUnavailable(false)
      setConfirmId(null)
      setNotice({ kind: "success", text: "Table list updated." })
    } catch {
      setNotice({ kind: "error", text: "Couldn't refresh tables. Check your connection and try again. The last loaded list has been kept." })
    } finally { finish() }
  }

  async function create(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    if (unavailable || pending.current) return
    const draft = parseTableDraft({ name, code, seats })
    if (!draft.ok) { setNotice({ kind: "error", text: draft.error }); return }
    if (!start("create")) return
    try {
      const { data, error } = await createClient().from("restaurant_tables")
        .insert({ business_id: businessId, branch_id: branchId, ...draft.value })
        .select(columns).single()
      if (error || !data) {
        setNotice({ kind: "error", text: error?.code === "23505"
          ? "That table code already exists in this branch. Refresh the list before trying a different code."
          : "Table couldn't be created. Your entries are saved here. Refresh the list before retrying if your connection was interrupted." })
        return
      }
      setTables(rows => [...rows, data].sort((a, b) => a.name.localeCompare(b.name)))
      setName(""); setCode(""); setSeats("4")
      setNotice({ kind: "success", text: `${data.name} created.` })
    } catch {
      setNotice({ kind: "error", text: "Connection interrupted. Your entries are saved here. Refresh the list to check whether the table was created before retrying." })
    } finally { finish() }
  }

  async function toggle(table: TableRow) {
    if (unavailable || !start(table.id)) return
    try {
      const { data, error } = await createClient().from("restaurant_tables")
        .update({ is_active: !table.is_active })
        .eq("id", table.id).eq("business_id", businessId).eq("branch_id", branchId)
        // A stale operator must not overwrite a newer status from another session.
        .eq("is_active", table.is_active).select(columns).maybeSingle()
      if (error) {
        setNotice({ kind: "error", text: error.code === "23514"
          ? "Close the active bill before deactivating this table. No change was made."
          : "Table status couldn't be changed. Check your access and connection, then refresh the list." })
        return
      }
      if (!data) {
        setNotice({ kind: "error", text: "This table changed or is no longer accessible. Refresh the list before trying again." })
        return
      }
      setTables(rows => rows.map(row => row.id === data.id ? data : row))
      setConfirmId(null)
      setNotice({ kind: "success", text: `${data.name} is now ${data.is_active ? "active" : "inactive"}.` })
    } catch {
      setNotice({ kind: "error", text: "Connection interrupted. Refresh the list to confirm this table's status before retrying." })
    } finally { finish() }
  }

  return <div className="page-stack table-manager">
    <div className="page-heading">
      <div><span className="eyebrow">DINE-IN CONTROL</span><h1>Restaurant tables</h1>
        <p>Manage seating and table availability for this branch. Each table can have one open bill.</p></div>
      <button type="button" className="button button--outline" onClick={() => void refresh()} disabled={Boolean(busy)}>
        <RefreshCw aria-hidden="true" />{busy === "refresh" ? "Refreshing…" : "Refresh tables"}
      </button>
    </div>
    {notice && <p className={`inline-notice ${notice.kind === "error" ? "is-error" : ""}`}
      role={notice.kind === "error" ? "alert" : "status"}>{notice.text}</p>}
    {unavailable && <div className="state-box" role="alert"><h2>Tables couldn&apos;t be loaded</h2>
      <p>Refresh to try again. Table changes are unavailable until the branch list loads.</p></div>}
    <section className="panel" aria-labelledby="table-create-title">
      <div className="panel-header"><div><h2 id="table-create-title">Add a table</h2><p>Choose a unique code, such as T07. Keep it consistent with your floor plan.</p></div></div>
      <form className="form-grid" onSubmit={create} aria-busy={busy === "create"}>
        <label>Table name<input ref={nameInput} required maxLength={80} value={name} disabled={Boolean(busy) || unavailable} onChange={event => setName(event.target.value)} placeholder="Table 7" /></label>
        <label>Code<input required maxLength={40} value={code} disabled={Boolean(busy) || unavailable} onChange={event => setCode(event.target.value)} placeholder="T07" autoCapitalize="characters" /></label>
        <label>Seats<input required type="number" min="1" max="100" step="1" value={seats} disabled={Boolean(busy) || unavailable} onChange={event => setSeats(event.target.value)} /></label>
        <button type="submit" className="button" disabled={Boolean(busy) || unavailable}>
          {busy === "create" ? <LoaderCircle className="table-action-spinner" aria-hidden="true" /> : <Plus aria-hidden="true" />}
          {busy === "create" ? "Creating…" : "Create table"}
        </button>
      </form>
    </section>
    {!unavailable && <section className="panel" aria-labelledby="table-floor-title" aria-busy={Boolean(busy) && busy !== "create"}>
      <div className="panel-header"><div><h2 id="table-floor-title">Branch floor</h2><p>{tables.length} tables · {tables.filter(table => table.is_active).length} active. Inactive tables cannot receive new waiter bills.</p></div></div>
      {tables.length > 0 ? <div className="data-table-wrap"><table className="data-table"><thead><tr><th scope="col">Table</th><th scope="col">Code</th><th scope="col">Seats</th><th scope="col">Status</th><th scope="col">Action</th></tr></thead>
        <tbody>{tables.map(table => <tr key={table.id} aria-busy={busy === table.id}>
          <td data-label="Table"><strong>{table.name}</strong></td><td data-label="Code">{table.code}</td><td data-label="Seats">{table.seats}</td>
          <td data-label="Status"><span className={`status-badge ${table.is_active ? "is-success" : "is-warning"}`}>{table.is_active ? "ACTIVE" : "INACTIVE"}</span></td>
          <td data-label="Action">{confirmId === table.id ? <div className="table-confirm">
            <p>Deactivate {table.name}? New waiter bills will be blocked. You can reactivate it later.</p>
            <div className="table-actions"><button type="button" className="button" disabled={Boolean(busy)} onClick={() => void toggle(table)}>{busy === table.id ? "Deactivating…" : "Confirm deactivation"}</button>
              <button type="button" className="button button--outline" disabled={Boolean(busy)} onClick={() => setConfirmId(null)}>Cancel</button></div>
          </div> : <button type="button" className="button button--outline" disabled={Boolean(busy)} onClick={() => table.is_active ? setConfirmId(table.id) : void toggle(table)}>
            {busy === table.id ? <LoaderCircle className="table-action-spinner" aria-hidden="true" /> : <Power aria-hidden="true" />}
            {busy === table.id ? "Activating…" : table.is_active ? "Deactivate" : "Activate"}
          </button>}</td>
        </tr>)}</tbody></table></div> : <div className="empty-panel"><h3>Your floor plan starts here</h3><p>Add your first table above. Use a code your team will recognize.</p></div>}
    </section>}
  </div>
}
