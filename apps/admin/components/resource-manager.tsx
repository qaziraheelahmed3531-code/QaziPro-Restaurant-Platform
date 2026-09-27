"use client"

import { normalizeSocialUrl } from "@italian-pizza/shared/social"
import { parseBoundary, validPoint } from "@italian-pizza/shared/location"
import { AppLoader } from "@italian-pizza/shared/app-loader"
import dynamic from "next/dynamic"
import { LocateFixed, Search, X } from "lucide-react"
import Image from "next/image"
import { useCallback, useEffect, useMemo, useState } from "react"
import { createClient } from "@/lib/supabase/client"
import { autoPopulateBranchAreas } from "@/app/actions/delivery-areas"
import type { ResourceConfig } from "@/lib/resources"

import { CollectionOrder, sortableCollections } from "@/components/collection-order"
import { adminError } from "@/lib/admin-errors"
import { MediaField } from "@/components/media-field"
import { mediaUrlError } from "@/lib/media"

const LocationMap = dynamic(() => import("@/components/location-map").then(module => module.LocationMap), { loading: () => <div className="map-loading" role="status"><AppLoader active delay={0} label="Loading map"/><span>Loading map…</span></div> })

type Row = Record<string, unknown>
type RelationOptions = Record<string, Array<{ value: string; label: string }>>
const weekdayNames = ["Sunday", "Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday"]

function displayValue(value: unknown) {
  if (typeof value === "boolean") return value ? "Yes" : "No"
  if (Array.isArray(value)) return value.join(", ") || "—"
  if (value === null || value === undefined || value === "") return "—"
  return String(value)
}

function displayCell(config: ResourceConfig, row: Row, column: string, assetOrigin?: string) {
  if (config.key === "banners" && column === "image_url" && row[column]) { const value=String(row[column]);const src=value.startsWith("/")&&assetOrigin?`${assetOrigin.replace(/\/$/,"")}${value}`:value;return <span className="banner-table-image"><Image src={src} width={96} height={42} unoptimized alt="" /><small>Desktop artwork</small></span> }
  if (config.key === "hours" && column === "day_of_week") return weekdayNames[Number(row[column])] ?? "Unknown day"
  return displayValue(row[column])
}

function initialDraft(config: ResourceConfig, row?: Row) {
  return Object.fromEntries(config.fields.map((field) => {
    const value = row?.[field.key]
    if (config.key === "hours" && field.key === "day_of_week") return [field.key, weekdayNames[Number(value)] ?? ""]
    if (field.type === "boolean") return [field.key, value ?? (field.key.startsWith("is_") || field.key.startsWith("show_"))]
    if (field.key === "boundary_type") return [field.key, value ?? "LOCALITY_MATCH"]
    if (field.type === "json") return [field.key, value ? JSON.stringify(value, null, 2) : ""]
    if (field.type === "array") return [field.key, Array.isArray(value) ? value.join(", ") : ""]
    if (field.type === "datetime" && typeof value === "string") return [field.key, value.slice(0, 16)]
    return [field.key, value ?? ""]
  }))
}

export function ResourceManager({ config, businessId, role, selectedBranchId, assetOrigin }: { assetOrigin?: string; selectedBranchId?: string; config: ResourceConfig; businessId: string; role: "OWNER" | "MANAGER" | "CASHIER" | "KITCHEN" | "WAITER" | "RIDER" | "STAFF" }) {
  const [rows, setRows] = useState<Row[]>([])
  const [page,setPage]=useState(0)
  const [total,setTotal]=useState(0)
  const [relations, setRelations] = useState<RelationOptions>({})
  const [branchId, setBranchId] = useState<string | null>(null)
  const [branchCity, setBranchCity] = useState("")
  const [branchPoint, setBranchPoint] = useState<{ latitude: number; longitude: number }>()
  const [restaurantLogo, setRestaurantLogo] = useState("")
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState("")
  const [query, setQuery] = useState("")
  const [editing, setEditing] = useState<Row | null | undefined>(undefined)
  const [draft, setDraft] = useState<Row>({})
  const [dirty, setDirty] = useState(false)
  const [saving, setSaving] = useState(false)
  const [mediaBusy, setMediaBusy] = useState<Record<string, boolean>>({})
  const uploading = Object.values(mediaBusy).some(Boolean)
  const [toast, setToast] = useState<{ message: string; error?: boolean } | null>(null)
  const canManage = !config.readOnly && (!config.ownerOnly || role === "OWNER")

  const load = useCallback(async () => {
    setLoading(true); setError("")
    try {
      const supabase = createClient()
      let resolvedBranchId: string | null = null
      let resolvedBranchCity = ""
      if (config.scope === "branch") {
        const { data: branch, error: branchError } = await supabase.from("branches").select("id,city,latitude,longitude").eq("business_id", businessId).eq("is_active", true).order("sort_order").eq("id", selectedBranchId ?? "").limit(1).maybeSingle()
        if (branchError) throw branchError
        resolvedBranchId = branch ? String(branch.id) : null
        resolvedBranchCity = String(branch?.city ?? "")
        setBranchId(resolvedBranchId)
        setBranchCity(resolvedBranchCity)
        setBranchPoint(branch?.latitude != null && branch.longitude != null && validPoint({ latitude: Number(branch.latitude), longitude: Number(branch.longitude) }) ? { latitude: Number(branch.latitude), longitude: Number(branch.longitude) } : undefined)
        if (config.key === "areas") {
          const branding = await supabase.from("business_branding").select("logo_url").eq("business_id", businessId).maybeSingle()
          setRestaurantLogo(String(branding.data?.logo_url ?? ""))
        }
      }

      if (config.scope === "branch" && !resolvedBranchId) {
        setRows([])
        setRelations({})
        return
      }

      let request = supabase.from(config.table).select("*",{count:"exact"})
      if (config.scope === "business") request = request.eq("business_id", businessId)
      if (config.scope === "business-record") request = request.eq("id", businessId)
      if (config.scope === "branch" && resolvedBranchId) request = request.eq("branch_id", resolvedBranchId)
      if (config.key === "areas" && resolvedBranchCity) request = request.eq("city", resolvedBranchCity)
      if (config.key === "modifierOptions") {
        const { data: groups, error: groupsError } = await supabase.from("modifier_groups").select("id").eq("business_id", businessId)
        if (groupsError) throw groupsError
        const groupIds = (groups ?? []).map((group: Row) => String(group.id))
        if (groupIds.length === 0) {
          setRows([])
          setRelations({ modifier_group_id: [] })
          return
        }
        request = request.in("modifier_group_id", groupIds)
      }
      if (["productImages", "productModifierGroups"].includes(config.key)) {
        const { data: products, error: productsError } = await supabase.from("products").select("id").eq("business_id", businessId)
        if (productsError) throw productsError
        const productIds = (products ?? []).map((product: Row) => String(product.id))
        if (productIds.length === 0) { setRows([]); setRelations({}); return }
        request = request.in("product_id", productIds)
      }
      if (config.key === "dealItems") {
        const { data: deals, error: dealsError } = await supabase.from("deals").select("id").eq("business_id", businessId)
        if (dealsError) throw dealsError
        const dealIds = (deals ?? []).map((deal: Row) => String(deal.id))
        if (dealIds.length === 0) { setRows([]); setRelations({}); return }
        request = request.in("deal_id", dealIds)
      }
      if (config.orderBy) request = request.order(config.orderBy, { ascending: config.orderBy !== "created_at" })
      const { data, count, error: loadError } = await request.range(page*50,page*50+49)
      if (loadError) throw loadError
      setRows((data ?? []) as Row[])
      setTotal(count??0)

      const relationFields = config.fields.filter((field) => field.relation)
      const optionEntries = await Promise.all(relationFields.map(async (field) => {
        const relation = field.relation!
        let relationQuery = supabase.from(relation.table).select(`${relation.value},${relation.label}${relation.table === "modifier_options" ? ",modifier_groups!inner(business_id)" : ""}`)
        if (["categories", "modifier_groups", "products", "deals", "branches", "suppliers", "ingredients", "purchases"].includes(relation.table)) relationQuery = relationQuery.eq("business_id", businessId)
        if (relation.table === "modifier_options") relationQuery = relationQuery.eq("modifier_groups.business_id", businessId)
        const { data: options, error: relationError } = await relationQuery.limit(250)
        if (relationError) throw relationError
        return [field.key, ((options ?? []) as unknown as Row[]).map((option) => ({ value: String(option[relation.value]), label: String(option[relation.label]) }))] as const
      }))
      setRelations(Object.fromEntries(optionEntries))
    } catch (loadError) {
      setError(loadError instanceof Error ? loadError.message : "This data could not be loaded.")
    } finally {
      setLoading(false)
    }
  }, [businessId, config, selectedBranchId, page])

  useEffect(() => { void Promise.resolve().then(load) }, [load])
  useEffect(() => {
    if (!dirty) return
    const warn = (event: BeforeUnloadEvent) => event.preventDefault()
    window.addEventListener("beforeunload", warn)
    return () => window.removeEventListener("beforeunload", warn)
  }, [dirty])
  useEffect(() => {
    if (!toast) return
    const timer = window.setTimeout(() => setToast(null), 3200)
    return () => window.clearTimeout(timer)
  }, [toast])

  const filteredRows = useMemo(() => {
    const normalized = query.trim().toLowerCase()
    if (!normalized) return rows
    return rows.filter((row) => config.columns.some((column) => displayValue(row[column]).toLowerCase().includes(normalized)))
  }, [config.columns, query, rows])

  const openEditor = (row?: Row) => {
    setEditing(row ?? null)
    const next=initialDraft(config,row)
    if(config.key==="areas"&&!row){next.city=branchCity;next.group_name=branchCity;next.country_code="pk";next.boundary_type="RADIUS";next.service_radius_meters=3000}
    setDraft(next)
    setDirty(false)
  }

  const closeEditor = () => {
    if (uploading) return
    if (dirty && !window.confirm("Discard unsaved changes?")) return
    setEditing(undefined); setDirty(false)
  }

  const setValue = (key: string, value: unknown) => {
    setDraft((current) => ({ ...current, [key]: value })); setDirty(true)
  }

  const useCurrentAreaLocation = () => {
    if (!window.isSecureContext || !navigator.geolocation) { setToast({ message: "Current location is unavailable. Click the map to choose the area centre.", error: true }); return }
    navigator.geolocation.getCurrentPosition(({ coords }) => {
      setDraft(current => ({ ...current, center_lat: coords.latitude, center_lng: coords.longitude }))
      setDirty(true)
    }, () => setToast({ message: "Location permission was denied. Click the map to choose the area centre.", error: true }), { enableHighAccuracy: true, timeout: 12000, maximumAge: 0 })
  }

  const save = async () => {
    setSaving(true)
    try {
      const payload: Row = {}
      for (const field of config.fields) {
        if (field.readOnly || (editing && config.key === "ingredients" && field.key === "current_stock")) continue
        const value = draft[field.key]
        if (field.required && (value === "" || value === null || value === undefined)) throw new Error(`${field.label} is required.`)
        if (field.type === "image" && value && mediaUrlError(String(value))) throw new Error(`${field.label}: ${mediaUrlError(String(value))}`)
         payload[field.key] = config.key === "hours" && field.key === "day_of_week" ? weekdayNames.indexOf(String(value)) : field.type === "json" ? (String(value ?? "").trim() ? JSON.parse(String(value)) : null) : field.type === "number" ? (value === "" ? null : Number(value)) : field.type === "array" ? String(value ?? "").split(",").map((item) => item.trim()).filter(Boolean) : field.type === "datetime" ? (value ? new Date(String(value)).toISOString() : null) : field.type === "relation" && value === "" ? null : value
      }
      if (config.key === "socialLinks") payload.url = normalizeSocialUrl(String(payload.platform ?? ""), payload.url)
      if (config.key === "posPaymentMethods") {
        payload.code = String(payload.code ?? "").trim().toUpperCase().replace(/[^A-Z0-9]+/g, "_").replace(/^_+|_+$/g, "")
        payload.name = String(payload.name ?? "").trim()
        if (String(payload.code).length < 2) throw new Error("Payment code must contain at least 2 letters or numbers.")
      }
      if (config.key === "areas") {
        if ((payload.center_lat == null) !== (payload.center_lng == null)) throw new Error("Enter both centre coordinates, or leave both empty.")
        if (payload.center_lat != null && !validPoint({ latitude: Number(payload.center_lat), longitude: Number(payload.center_lng) })) throw new Error("Centre coordinates are invalid.")
        if (payload.service_radius_meters != null && (!Number.isFinite(Number(payload.service_radius_meters)) || Number(payload.service_radius_meters) <= 0)) throw new Error("Service radius must be greater than zero.")
        if (payload.boundary_geojson) {
          const boundary = parseBoundary(payload.boundary_geojson)
          if (!boundary) throw new Error("Enter a valid, closed Polygon or MultiPolygon in longitude, latitude order.")
          payload.boundary_geojson = boundary
        }
        if (payload.boundary_type === "POLYGON" && !payload.boundary_geojson) throw new Error("Polygon coverage requires a real boundary.")
        if (payload.boundary_type === "RADIUS" && (payload.center_lat == null || payload.service_radius_meters == null)) throw new Error("Radius coverage requires a centre and service radius.")
      }
      if (config.scope === "business") payload.business_id = businessId
      if (config.scope === "branch") {
        if (!branchId) throw new Error("Create an active branch first.")
        payload.branch_id = branchId
      }
      const supabase = createClient()
      let mutationError
      let savedBranchId = editing?.id ? String(editing.id) : ""
      if (editing) {
        const identity = editing.id ? ["id", editing.id] : editing.business_id ? ["business_id", editing.business_id] : ["branch_id", editing.branch_id]
        const result = await supabase.from(config.table).update(payload).eq(String(identity[0]), identity[1])
        mutationError = result.error
      } else {
        const result = config.key === "branches"
          ? await supabase.from(config.table).insert(payload).select("id").single()
          : await supabase.from(config.table).insert(payload)
        mutationError = result.error
        if (config.key === "branches" && result.data) savedBranchId = String((result.data as { id: string }).id)
      }
      if (mutationError) throw new Error(adminError(mutationError))
      let successMessage = "Saved successfully."
      if (config.key === "branches" && savedBranchId) {
        const discovery = await autoPopulateBranchAreas(savedBranchId)
        successMessage = discovery.message
      }
      setEditing(undefined); setDirty(false); setToast({ message: successMessage })
      await load(); void fetch("/api/revalidate-customer", { method: "POST" })
    } catch (saveError) {
      setToast({ message: saveError instanceof Error ? saveError.message : "Save failed.", error: true })
    } finally { setSaving(false) }
  }

  const remove = async (row: Row) => {
    const recordName = displayValue(row.name ?? row.title ?? row.internal_name ?? row.label ?? "this record")
    if (!window.confirm(`Permanently delete ${recordName}? This cannot be undone.`)) return
    try {
      const id = row.id
      if (!id) throw new Error("Record identifier is missing.")
      const supabase = createClient()
      const result = await supabase.from(config.table).delete().eq("id", id)
      if (result.error) throw new Error(adminError(result.error))
      setToast({ message: "Record deleted permanently." }); await load(); void fetch("/api/revalidate-customer", { method:"POST" })
    } catch (removeError) { setToast({ message: removeError instanceof Error ? removeError.message : "Delete failed.", error:true }) }
  }

  return <>
    <div className="page-heading"><div><h1>{config.title}</h1><p>{config.description}</p></div>{canManage && config.allowCreate && <button className="button" type="button" onClick={() => openEditor()}>Add new</button>}</div>
    {canManage && sortableCollections.includes(config.key) && <CollectionOrder businessId={businessId} collection={config.key} onSaved={() => void load()}/>}
    <div className="resource-toolbar"><label className="search-field"><Search aria-hidden="true"/><input value={query} onChange={(event) => setQuery(event.target.value)} placeholder={`Search ${config.title.toLowerCase()}…`} aria-label={`Search ${config.title}`}/></label><small>{filteredRows.length} records</small></div>
    {loading ? <div className="state-box state-box--loading" role="status"><AppLoader active delay={0} label="Loading database records"/><span>Loading database records…</span></div> : error ? <div className="state-box"><div><strong>Could not load this section</strong><p>{error}</p><button className="button button--outline" onClick={() => void load()}>Retry</button></div></div> : filteredRows.length === 0 ? <div className="state-box"><div><strong>No records yet</strong><p>Create the first record when this section is ready.</p>{canManage && <button className="button" onClick={() => openEditor()}>Configure now</button>}</div></div> : <div className="data-table-wrap"><table className="data-table"><thead><tr>{config.columns.map((column) => <th key={column}>{config.fields.find((field) => field.key === column)?.label ?? column.replaceAll("_"," ")}</th>)}{canManage && <th>Actions</th>}</tr></thead><tbody>{filteredRows.map((row, index) => <tr key={String(row.id ?? row.business_id ?? row.branch_id ?? index)}>{config.columns.map((column) => <td key={column} data-label={config.fields.find((field) => field.key === column)?.label ?? column}>{displayCell(config, row, column, assetOrigin)}</td>)}{canManage && <td data-label="Actions"><div className="table-actions"><button type="button" onClick={() => openEditor(row)}>Edit</button>{Boolean(row.id) && (config.allowArchive || config.allowDelete) && <button type="button" className="is-danger" onClick={() => void remove(row)}>Delete</button>}</div></td>}</tr>)}</tbody></table></div>}

    <div className="heading-actions section-gap"><button className="button button--outline" disabled={page===0||loading} onClick={()=>setPage(value=>value-1)}>Previous</button><span>Page {page+1} · {total} records · search applies to this page</span><button className="button button--outline" disabled={(page+1)*50>=total||loading} onClick={()=>setPage(value=>value+1)}>Next</button></div>
    {editing !== undefined && <div className="drawer-backdrop" role="presentation" onMouseDown={(event) => { if (event.target === event.currentTarget) closeEditor() }}><section className="editor" role="dialog" aria-modal="true" aria-labelledby="editor-title"><header><h2 id="editor-title">{editing ? `Edit ${config.title}` : `Add ${config.title}`}</h2><button className="icon-action" type="button" onClick={closeEditor} aria-label="Close editor"><X/></button></header><div className="editor-form">{config.key === "areas" && <div className="is-wide"><p>Click the map for the area centre, use your current location, then set the radius. The restaurant logo marks the saved branch origin. Provider-discovered sectors should be imported above for locality coverage.</p><button className="button button--outline" type="button" onClick={useCurrentAreaLocation}><LocateFixed size={16}/> Use current location for area</button><LocationMap label="Area centre" center={branchPoint} originPoint={branchPoint} originImageUrl={restaurantLogo} originLabel="Restaurant origin" point={draft.center_lat !== "" && draft.center_lat != null && draft.center_lng !== "" && draft.center_lng != null ? { latitude: Number(draft.center_lat), longitude: Number(draft.center_lng) } : undefined} radiusMeters={draft.boundary_type === "RADIUS" ? Number(draft.service_radius_meters) : undefined} onChange={point => { setDraft(current => ({ ...current, center_lat: point.latitude, center_lng: point.longitude })); setDirty(true) }} /></div>}{config.fields.map((field) => {
      const value = draft[field.key]
      const className = field.wide ? "is-wide" : undefined
      if (field.type === "boolean") return <label key={field.key} className={`checkbox-field ${className ?? ""}`}><input type="checkbox" checked={Boolean(value)} onChange={(event) => setValue(field.key,event.target.checked)}/><span>{field.label}</span></label>
      if (field.type === "textarea" || field.type === "json") return <label key={field.key} className={className}><span>{field.label}</span><textarea value={String(value ?? "")} required={field.required} onChange={(event) => setValue(field.key,event.target.value)}/></label>
      if (field.type === "select" || field.type === "relation") return <label key={field.key} className={className}><span>{field.label}</span><select value={String(value ?? "")} required={field.required} onChange={(event) => setValue(field.key,event.target.value)}><option value="">Select…</option>{(field.type === "relation" ? relations[field.key] ?? [] : (field.options ?? []).map((option) => ({value:option,label:option}))).map((option) => <option key={option.value} value={option.value}>{option.label}</option>)}</select></label>
      if (field.type === "image") return <div key={field.key} className={className}><MediaField label={field.label} value={String(value ?? "")} onChange={url => setValue(field.key, url)} bucket={field.bucket!} assetOrigin={assetOrigin} folder={`${businessId}/${config.key}`} required={field.required} onBusy={busy => setMediaBusy(current => ({...current, [field.key]: busy}))}/></div>
      return <label key={field.key} className={className}><span>{field.label}</span><input type={field.type === "number" ? "number" : field.type === "datetime" ? "datetime-local" : field.type === "time" ? "time" : field.type === "color" ? "color" : "text"} step={field.type === "number" ? "any" : undefined} value={String(value ?? "")} required={field.required} readOnly={field.readOnly || Boolean(editing && config.key==="ingredients" && field.key==="current_stock")} onChange={(event) => setValue(field.key,event.target.value)}/></label>
    })}</div><footer className="editor-footer"><button className="button button--outline" type="button" onClick={closeEditor}>Cancel</button><button className="button" type="button" onClick={() => void save()} disabled={saving || uploading}>{saving ? "Saving…" : "Save changes"}</button></footer></section></div>}
    {toast && <div className={toast.error ? "toast is-error" : "toast"} role="status">{toast.message}</div>}
  </>
}
