"use client"

import { useCallback, useEffect, useState } from "react"
import { Reorder, useDragControls } from "motion/react"
import { ArrowDown, ArrowUp, GripVertical } from "lucide-react"
import { createClient } from "@/lib/supabase/client"

type Entry = { id: string; label: string; sort_order: number }
const parents: Record<string, { table: string; label: string }> = { areas: { table: "branches", label: "Branch" }, productModifierGroups: { table: "products", label: "Product" }, products: { table: "categories", label: "Category" }, modifierOptions: { table: "modifier_groups", label: "Modifier group" }, productImages: { table: "products", label: "Product" } }
export const sortableCollections = ["areas","categories", "products", "banners", "promotionalBanners", "deals", "modifierGroups", "modifierOptions", "socialLinks", "footerLinks", "contentPages", "productImages", "productModifierGroups"]

function OrderItem({ entry, index, length, disabled, move }: { entry: Entry; index: number; length: number; disabled: boolean; move: (from: number, to: number) => void }) {
  const drag = useDragControls()
  return <Reorder.Item value={entry} dragListener={false} dragControls={drag} className="collection-order-item">
    <button type="button" className="icon-action drag-handle" disabled={disabled} aria-label={`Drag ${entry.label}; use arrow buttons to move with keyboard`} onPointerDown={event => { if (!disabled) drag.start(event) }}><GripVertical aria-hidden="true"/></button>
    <span>{index + 1}. {entry.label}</span>
    <button type="button" className="icon-action" disabled={disabled || index === 0} aria-label={`Move ${entry.label} up`} onClick={() => move(index, index - 1)}><ArrowUp aria-hidden="true"/></button>
    <button type="button" className="icon-action" disabled={disabled || index === length - 1} aria-label={`Move ${entry.label} down`} onClick={() => move(index, index + 1)}><ArrowDown aria-hidden="true"/></button>
  </Reorder.Item>
}

export function CollectionOrder({ businessId, collection, onSaved }: { businessId: string; collection: string; onSaved: () => void }) {
  const [items, setItems] = useState<Entry[]>([])
  const [snapshot, setSnapshot] = useState<Entry[]>([])
  const [parent, setParent] = useState("")
  const [options, setOptions] = useState<Array<{ id: string; name: string }>>([])
  const [busy, setBusy] = useState(false)
  const [message, setMessage] = useState("")
  const parentConfig = parents[collection]
  const dirty = JSON.stringify(items) !== JSON.stringify(snapshot)
  const load = useCallback(async () => {
    if (parents[collection] && !parent) return
    setBusy(true)
    const { data, error } = await createClient().rpc("content_order", { p_business_id: businessId, p_collection: collection, p_parent: parent || null })
    if (error) setMessage("Could not load ordering. Check access and database migrations, then retry.")
    else { setItems(data ?? []); setSnapshot(data ?? []); setMessage("") }
    setBusy(false)
  }, [businessId, collection, parent])
  useEffect(() => { void Promise.resolve().then(load) }, [load])
  useEffect(() => {
    const config = parents[collection]
    if (!config) return
    let cancelled = false
    void createClient().from(config.table).select("id,name").eq("business_id", businessId).order("name").limit(1000).then(({ data }) => { if (!cancelled) setOptions(data ?? []) })
    return () => { cancelled = true }
  }, [businessId, collection])
  useEffect(() => {
    if (!dirty) return
    const warn = (event: BeforeUnloadEvent) => event.preventDefault()
    window.addEventListener("beforeunload", warn)
    return () => window.removeEventListener("beforeunload", warn)
  }, [dirty])
  async function save() {
    setBusy(true)
    const { error } = await createClient().rpc("reorder_content", { p_business_id: businessId, p_collection: collection, p_parent: parent || null, p_ids: items.map(item => item.id), p_expected: snapshot })
    if (error) { setItems(snapshot); setMessage("Order was not saved. It may have changed elsewhere. Reload and try again.") }
    else { await load(); setMessage("Order saved. Customer content will refresh."); onSaved(); void fetch("/api/revalidate-customer", { method: "POST" }) }
    setBusy(false)
  }
  function move(from: number, to: number) {
    setItems(current => { const next = [...current]; const [item] = next.splice(from, 1); next.splice(to, 0, item); return next })
    setMessage(`Moved to position ${to + 1}. Save order to publish.`)
  }
  return <details className="panel collection-order"><summary>Drag to reorder</summary><p>Drag the handle, or use the up/down buttons. Save once to publish the complete order.</p>
    {parentConfig && <label>{parentConfig.label}<select value={parent} disabled={busy} onChange={event => { if (dirty && !window.confirm("Discard unsaved ordering?")) return; setParent(event.target.value); setItems([]); setSnapshot([]) }}><option value="">Select {parentConfig.label.toLowerCase()}</option>{options.map(option => <option value={option.id} key={option.id}>{option.name}</option>)}</select></label>}
    <Reorder.Group axis="y" values={items} onReorder={next => { if (!busy) setItems(next) }} className="collection-order-list" layoutScroll>{items.map((entry, index) => <OrderItem key={entry.id} entry={entry} index={index} length={items.length} disabled={busy} move={move}/>)}</Reorder.Group>
    <div className="heading-actions"><button type="button" className="button" disabled={!dirty || busy} onClick={() => void save()}>{busy ? "Please wait…" : "Save order"}</button><button type="button" className="button button--outline" disabled={busy} onClick={() => { if (!dirty || window.confirm("Discard unsaved ordering and reload?")) void load() }}>Reload order</button></div>
    <p role="status">{message}</p>
  </details>
}
