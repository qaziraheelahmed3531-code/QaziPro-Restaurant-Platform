"use client"

import { formatPkr } from "@italian-pizza/shared"
import { AlertTriangle, PackagePlus, RefreshCw, Warehouse } from "lucide-react"
import { useMemo, useState } from "react"
import { createClient } from "@/lib/supabase/client"

type Ingredient = {
  id: string; name: string; sku: string | null; unit: string; current_stock: number
  minimum_stock: number; cost_per_unit: number; is_active: boolean
  suppliers: { name: string } | Array<{ name: string }> | null
}

export function InventoryManager({ initialRows, canManage, canManageIngredients, branchName }: { initialRows: Ingredient[]; canManage: boolean; canManageIngredients: boolean; branchName: string }) {
  const [rows, setRows] = useState(initialRows)
  const [selected, setSelected] = useState<Ingredient | null>(null)
  const [delta, setDelta] = useState("")
  const [reason, setReason] = useState("")
  const [message, setMessage] = useState("")
  const [busy, setBusy] = useState(false)
  const low = rows.filter((row) => row.is_active && Number(row.current_stock) <= Number(row.minimum_stock))
  const stockValue = useMemo(() => rows.reduce((sum, row) => sum + Number(row.current_stock) * Number(row.cost_per_unit), 0), [rows])

  const adjust = async () => {
    if (!selected) return
    setBusy(true)
    const { data, error } = await createClient().rpc("adjust_inventory", { p_ingredient_id: selected.id, p_quantity_delta: Number(delta), p_reason: reason })
    if (error) setMessage(error.message)
    else {
      setRows((current) => current.map((row) => row.id === selected.id ? { ...row, ...data } : row))
      setSelected(null); setDelta(""); setReason(""); setMessage("Stock adjustment recorded with movement history.")
    }
    setBusy(false)
  }

  return <>
    <div className="page-heading">
      <div><span className="eyebrow">INVENTORY · {branchName}</span><h1>Stock on hand</h1><p>Every quantity change is represented by an immutable stock movement.</p></div>
      <div className="heading-actions"><a className="button button--outline" href="/inventory/movements">Movement history</a>{canManageIngredients && <a className="button" href="/inventory/manage"><PackagePlus />Manage ingredients</a>}</div>
    </div>
    {message && <div className="inline-notice">{message}</div>}
    <section className="metric-grid">
      <article className="metric-card"><span>Active ingredients</span><strong>{rows.filter((row) => row.is_active).length}</strong><small>Configured stock items</small></article>
      <article className="metric-card"><span>Low stock</span><strong>{low.length}</strong><small>At or below minimum</small></article>
      <article className="metric-card"><span>Estimated stock value</span><strong>{formatPkr(stockValue)}</strong><small>Quantity × latest unit cost</small></article>
    </section>
    {low.length > 0 && <section className="low-stock-strip"><AlertTriangle /><div><strong>{low.length} ingredients need attention</strong><span>{low.slice(0, 5).map((row) => row.name).join(", ")}</span></div></section>}
    <section className="panel section-gap">
      <div className="panel-header"><h2>Ingredient ledger</h2><span>{rows.length} items</span></div>
      {rows.length ? <div className="data-table-wrap"><table className="data-table">
        <thead><tr><th>Ingredient</th><th>SKU</th><th>On hand</th><th>Minimum</th><th>Unit cost</th><th>Supplier</th>{canManage && <th>Action</th>}</tr></thead>
        <tbody>{rows.map((row) => {
          const supplier = Array.isArray(row.suppliers) ? row.suppliers[0] : row.suppliers
          const isLow = Number(row.current_stock) <= Number(row.minimum_stock)
          return <tr key={row.id}>
            <td data-label="Ingredient"><strong>{row.name}</strong>{isLow && <span className="status-badge is-warning">Low</span>}</td>
            <td data-label="SKU">{row.sku ?? "—"}</td><td data-label="On hand">{Number(row.current_stock).toLocaleString()} {row.unit}</td>
            <td data-label="Minimum">{Number(row.minimum_stock).toLocaleString()} {row.unit}</td><td data-label="Unit cost">{formatPkr(row.cost_per_unit)}</td>
            <td data-label="Supplier">{supplier?.name ?? "—"}</td>{canManage && <td data-label="Action"><button className="button button--outline" onClick={() => setSelected(row)}><RefreshCw />Adjust</button></td>}
          </tr>
        })}</tbody>
      </table></div> : <div className="empty-panel"><Warehouse /><p>No ingredients configured for this branch.</p></div>}
    </section>
    {selected && <div className="drawer-backdrop"><section className="editor" role="dialog" aria-modal="true" aria-labelledby="adjust-title">
      <header><h2 id="adjust-title">Adjust {selected.name}</h2><button className="icon-action" aria-label="Close adjustment" onClick={() => setSelected(null)}>×</button></header>
      <div className="editor-form"><label><span>Quantity change</span><input type="number" step="any" value={delta} onChange={(event) => setDelta(event.target.value)} placeholder="Use negative to reduce" /></label><label className="is-wide"><span>Reason</span><textarea value={reason} onChange={(event) => setReason(event.target.value)} placeholder="Required audit explanation" /></label></div>
      <footer className="editor-footer"><button className="button button--outline" onClick={() => setSelected(null)}>Cancel</button><button className="button" disabled={busy || !delta || reason.trim().length < 2} onClick={() => void adjust()}>Record adjustment</button></footer>
    </section></div>}
  </>
}
