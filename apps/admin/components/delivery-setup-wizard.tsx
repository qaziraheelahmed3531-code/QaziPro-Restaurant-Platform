"use client"
/* eslint-disable react-hooks/set-state-in-effect */

import { LocateFixed, MapPin, Search, Sparkles } from "lucide-react"
import { useEffect, useMemo, useRef, useState } from "react"
import { LocationMap } from "@/components/location-map"
import { validPoint } from "@italian-pizza/shared/location"
import { AppLoader } from "@italian-pizza/shared/app-loader"
import { createClient } from "@/lib/supabase/client"

type Point = { latitude: number; longitude: number }
type Candidate = { provider?: "google" | "geoapify"; name: string; slug: string; providerPlaceId: string | null; formattedAddress: string; city: string; countryCode: string; countryName?: string; postalCode?: string; region: string | null; latitude?: number | null; longitude?: number | null; placeType?: string; type?: string; aliases?: string[]; isBusiness?: boolean }
type Branch = { restaurant_name?: string | null; location_revision?: number; location_provider?: string | null; provider_place_id?: string | null; location_name?: string | null; location_locality?: string | null; id: string; name: string; city: string; country_code?: string | null; country_name?: string | null; region?: string | null; postal_code?: string | null; google_place_id?: string | null; google_locality?: string | null; address?: string | null; formatted_address?: string | null; latitude?: number | null; longitude?: number | null; timezone?: string | null }
type Area = { id: string; name: string; parent_id?: string | null; level?: string | null; city?: string | null }

function pointOf(branch: Branch | null): Point | undefined {
  return branch?.latitude != null && branch.longitude != null ? { latitude: Number(branch.latitude), longitude: Number(branch.longitude) } : undefined
}

export function DeliverySetupWizard({ businessId, branchId, locationOnly=false }: { businessId: string; branchId?: string; locationOnly?: boolean }) {
  const [areas, setAreas] = useState<Area[]>([])
  const [countryCode, setCountryCode] = useState("pk")
  const [countryName, setCountryName] = useState("Pakistan")
  const [postalCode, setPostalCode] = useState("")
  const [placeId, setPlaceId] = useState("")
  const [selectedPlaceName, setSelectedPlaceName] = useState("")
  const [restaurantName, setRestaurantName] = useState("")
  const [restaurantLogo, setRestaurantLogo] = useState("")
  const [savedCity, setSavedCity] = useState("")
  const [city, setCity] = useState("")
  const [region, setRegion] = useState("")
  const [address, setAddress] = useState("")
  const [point, setPoint] = useState<Point>()
  const [search, setSearch] = useState("")
  const [suggestions, setSuggestions] = useState<Candidate[]>([])
  const [activeSuggestion, setActiveSuggestion] = useState(-1)
  const [candidates, setCandidates] = useState<Candidate[]>([])
  const [selected, setSelected] = useState<string[]>([])
  const [loading, setLoading] = useState(true)
  const [busy, setBusy] = useState(false)
  const [message, setMessage] = useState("")
  const [error, setError] = useState("")
  const lookupController = useRef<AbortController | null>(null)
  const reverseController = useRef<AbortController | null>(null)
  const lookupSequence = useRef(0)
  const pinSequence = useRef(0)
  useEffect(() => () => { lookupController.current?.abort(); reverseController.current?.abort(); ++pinSequence.current }, [])

  const load = async () => {
    if (!branchId) { setLoading(false); return }
    setLoading(true); setError("")
    const supabase = createClient()
    const [branchResult, areasResult, brandingResult] = await Promise.all([
      supabase.from("branches").select("id,name,restaurant_name,location_revision,city,country_code,country_name,region,postal_code,google_place_id,google_locality,location_provider,provider_place_id,location_name,location_locality,address,formatted_address,latitude,longitude,timezone").eq("id", branchId).eq("business_id", businessId).single(),
      supabase.from("delivery_areas").select("id,name,parent_id,level,city").eq("branch_id", branchId).eq("is_active", true).order("sort_order").order("name"),
      supabase.from("business_branding").select("logo_url").eq("business_id", businessId).maybeSingle(),
    ])
    if (branchResult.error) setError(branchResult.error.message)
    else { const value = branchResult.data as Branch; setCountryCode(value.country_code || "pk"); setCountryName(value.country_name || "Pakistan"); setPostalCode(value.postal_code || ""); setPlaceId(value.provider_place_id || ""); setSelectedPlaceName(value.location_name || ""); setRestaurantName(value.restaurant_name || value.name.split(" — ")[0] || ""); setCity(value.city || value.location_locality || value.google_locality || ""); setSavedCity(value.city || ""); setRegion(value.region || ""); setAddress(value.formatted_address || value.address || ""); setPoint(pointOf(value)) }
    setAreas((areasResult.data ?? []) as Area[])
    setRestaurantLogo(String(brandingResult.data?.logo_url ?? ""))
    setLoading(false)
  }
  // The loader synchronizes this client editor with the selected branch.
  // eslint-disable-next-line react-hooks/exhaustive-deps
  useEffect(() => { void load() }, [branchId, businessId])

  const lookup = async (mode: "address" | "search" | "areas", query = "") => {
    lookupController.current?.abort()
    const controller = new AbortController(); lookupController.current = controller
    const sequence = ++lookupSequence.current
    setBusy(true); setError("")
    try {
      const params = new URLSearchParams({ mode, countryCode, city, q: query })
      if (point) { params.set("latitude", String(point.latitude)); params.set("longitude", String(point.longitude)) }
      const response = await fetch(`/api/delivery/discover?${params}`, { cache: "no-store", signal: controller.signal })
      const result = await response.json() as { error?: string; candidates?: Candidate[] }
      if (sequence !== lookupSequence.current) return
      if (!response.ok) throw new Error(result.error || "Location lookup failed.")
      if (mode === "address" || mode === "search") { setSuggestions(result.candidates ?? []); setActiveSuggestion(-1) }
      else { setCandidates(result.candidates ?? []); setSelected([]) }
    } catch (lookupError) { if (!controller.signal.aborted && sequence === lookupSequence.current) setError(lookupError instanceof Error ? lookupError.message : "Location lookup failed.") }
    finally { if (sequence === lookupSequence.current) setBusy(false) }
  }

  useEffect(() => {
    const query = search.trim()
    if (query.length < 2) { ++lookupSequence.current;setBusy(false);setSuggestions([]); return }
    const timer = window.setTimeout(() => void lookup("address", query), 320)
    return () => { window.clearTimeout(timer); lookupController.current?.abort() }
    // Search inputs intentionally debounce against the current branch location.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [search])

  const chooseAddress = async (item: Candidate) => {
    ++pinSequence.current; ++lookupSequence.current
    lookupController.current?.abort(); reverseController.current?.abort()
    if(item.latitude == null || item.longitude == null)return
    setAddress(item.formattedAddress);setCity(item.city || city);setRegion(item.region || region)
    setCountryCode(item.countryCode || countryCode);setCountryName(item.countryName || countryName)
    setPostalCode(item.postalCode || "");setPlaceId(item.providerPlaceId || "");setSelectedPlaceName(item.name)
    if (item.isBusiness) setRestaurantName(item.name)
    setPoint({latitude:item.latitude,longitude:item.longitude});setSuggestions([]);setBusy(false);setError("")
  }

  const useCurrent = () => {
    if (!window.isSecureContext) { setError("Current location needs a secure connection. Search or choose a map point."); return }
    if (!navigator.geolocation) { setError("Current location is not supported in this browser."); return }
    const sequence = ++pinSequence.current
    setBusy(true); setError("")
    navigator.geolocation.getCurrentPosition(value => {
      if(sequence===pinSequence.current)void reversePoint({latitude:value.coords.latitude,longitude:value.coords.longitude})
    }, () => { if(sequence===pinSequence.current){setBusy(false);setError("Location permission was not available.")} }, { enableHighAccuracy:true, timeout:12000, maximumAge:0 })
  }

  const reversePoint = async (next: Point) => {
    reverseController.current?.abort(); lookupController.current?.abort()
    const controller=new AbortController(); reverseController.current=controller
    const sequence=++pinSequence.current
    ++lookupSequence.current
    setSuggestions([]);setAddress("");setPoint(next); setPlaceId(""); setSelectedPlaceName(""); setBusy(true); setError("")
    try {
      const params = new URLSearchParams({ mode: "reverse", countryCode, city, latitude: String(next.latitude), longitude: String(next.longitude) })
      const response = await fetch(`/api/delivery/discover?${params}`, { cache: "no-store", signal: controller.signal })
      const result = await response.json() as { candidates?: Candidate[] }
      if(sequence!==pinSequence.current)return
      const first = result.candidates?.[0]
      if (!response.ok||!first)throw new Error("No address")
      setAddress(first.formattedAddress); setCity(first.city || city); setRegion(first.region || region);setCountryCode(first.countryCode||countryCode);setCountryName(first.countryName||countryName);setPostalCode(first.postalCode||"")
    } catch { if(sequence===pinSequence.current)setError("The pin was set, but the address could not be identified. Enter the address before saving.") } finally { if(sequence===pinSequence.current)setBusy(false) }
  }

  const save = async () => {
    if (!branchId || !point || !validPoint(point) || (point.latitude===0 && point.longitude===0) || !restaurantName.trim() || !city.trim() || !address.trim()) { setError("Choose a restaurant name, pin, city and address first."); return }
    const cityChanged = Boolean(savedCity && savedCity.toLocaleLowerCase() !== city.trim().toLocaleLowerCase())
    if (cityChanged && !window.confirm(`Changing restaurant city will deactivate current ${savedCity} delivery areas for this branch and load ${city.trim()} areas. Historical orders will not be affected. Continue?`)) return
    setBusy(true); setError("")
    try {
      const supabase = createClient()
      const branchUpdate = await supabase.rpc("save_restaurant_origin", { p_branch_id:branchId,p_location:{ restaurant_name:restaurantName.trim(), city: city.trim(), country_code: countryCode.trim().toLowerCase(), country_name: countryName.trim() || null, region: region.trim() || null, postal_code: postalCode.trim() || null, provider: "geoapify", provider_place_id: placeId.trim() || null, location_name: selectedPlaceName, address: address.trim(), formatted_address: address.trim(), latitude: point.latitude, longitude: point.longitude }})
      if (branchUpdate.error) throw branchUpdate.error
      if(branchUpdate.data?.id!==branchId)throw new Error("The restaurant location was not saved. Please retry.")
      setSavedCity(city.trim()); setMessage("Restaurant location saved. Checking provider-backed areas for this city…"); await load(); window.dispatchEvent(new CustomEvent("restaurant-location-updated",{detail:{branchId}})); void fetch("/api/revalidate-customer", { method: "POST" }); await lookup("areas")
    } catch (saveError) { setError(saveError instanceof Error ? saveError.message : "Restaurant location could not be saved.") }
    finally { setBusy(false) }
  }

  const importAreas = async (areaIds = selected) => {
    if (!branchId || areaIds.length === 0) return
    setBusy(true); setError("")
    try {
      const supabase = createClient(); const rows = candidates.filter(item => areaIds.includes(item.providerPlaceId || `${item.slug}:${item.latitude}`) && item.latitude != null && item.longitude != null).map(item => ({ name:item.name,slug:item.slug,aliases:item.aliases??[],providerPlaceId:item.providerPlaceId,latitude:item.latitude,longitude:item.longitude,countryCode:item.countryCode||countryCode }))
      const result = await supabase.rpc("import_delivery_area_candidates", { p_branch_id:branchId,p_candidates:rows })
      if (result.error) throw result.error
      const imported=Number(result.data?.importedCount??rows.length);setMessage(`${imported} provider-backed area${imported === 1 ? "" : "s"} imported for ${city}.`); await load(); setCandidates([]); setSelected([]);void fetch("/api/revalidate-customer",{method:"POST"})
    } catch (importError) { setError(importError instanceof Error ? importError.message : "Areas could not be imported.") }
    finally { setBusy(false) }
  }

  const existingNames = useMemo(() => new Set(areas.map(area => area.name.toLowerCase().replace(/[^\p{L}\p{N}]+/gu,""))), [areas])
  if (!branchId) return <section className="panel delivery-setup-wizard"><h2>Restaurant location</h2><p>Create an active branch before configuring delivery.</p></section>
  if (loading) return <section className="panel delivery-setup-wizard"><p className="state-box--loading" role="status"><AppLoader active delay={0} label="Loading delivery setup" /><span>Loading delivery setup…</span></p></section>
  return <section className="panel delivery-setup-wizard" aria-labelledby="delivery-setup-title">
    <div className="panel-header"><div><h2 id="delivery-setup-title">Restaurant Location</h2><p>Search or choose the restaurant pin.</p></div></div>
    {error && <p className="inline-notice is-error" role="alert">{error}</p>}{message && <p className="inline-notice" role="status">{message}</p>}
    {!point && <p className="inline-notice is-warning" role="status">Restaurant coordinates are not saved yet. Customer delivery checkout will remain unavailable until you choose and save an origin.</p>}
    <div className="delivery-setup-grid">
      <div className="delivery-setup-form">
        <label className="delivery-setup-wide"><span>Restaurant address</span><div className="setup-search"><input value={search} onChange={event => setSearch(event.target.value)} onKeyDown={event => { if (event.key === "Escape") { setSuggestions([]); setActiveSuggestion(-1) } else if (event.key === "ArrowDown") { event.preventDefault(); setActiveSuggestion(current => Math.min(suggestions.length - 1, current + 1)) } else if (event.key === "ArrowUp") { event.preventDefault(); setActiveSuggestion(current => Math.max(0, current - 1)) } else if (event.key === "Enter") { event.preventDefault(); if (activeSuggestion >= 0 && suggestions[activeSuggestion]) void chooseAddress(suggestions[activeSuggestion]); else void lookup("search", search) } }} placeholder="Search a restaurant, business or address (e.g. JFC Ghazi Tarbela)" role="combobox" aria-expanded={suggestions.length > 0} aria-controls="admin-place-suggestions" aria-activedescendant={activeSuggestion >= 0 ? `admin-place-${activeSuggestion}` : undefined} /><button type="button" className="button button--outline" onClick={() => void lookup("search", search)} disabled={busy || search.trim().length < 2}><Search size={16} /> Search</button></div></label>
        {suggestions.length > 0 && <div className="setup-suggestions" id="admin-place-suggestions" role="listbox">{suggestions.map((item, index) => <button id={`admin-place-${index}`} type="button" role="option" aria-selected={activeSuggestion === index} className={activeSuggestion === index ? "is-active" : undefined} key={`${item.providerPlaceId}-${item.name}`} onClick={() => void chooseAddress(item)}><MapPin size={16} /><span><strong>{item.name || item.formattedAddress}</strong><small>{item.formattedAddress || item.city}{item.placeType ? ` · ${item.placeType}` : ""}</small></span></button>)}</div>}
        <label className="delivery-setup-wide"><span>Restaurant name</span><input value={restaurantName} onChange={event=>setRestaurantName(event.target.value)} placeholder="Restaurant display name" /></label>
        {selectedPlaceName && <p className="delivery-setup-wide inline-notice"><strong>{selectedPlaceName}</strong><br />Provider location selected. The restaurant name is proposed only for real business results and remains editable.</p>}
        <label className="delivery-setup-wide"><span>Selected address</span><input value={address} onChange={event => setAddress(event.target.value)} placeholder="Choose a search result or pin the map" /></label>
        <details className="delivery-setup-wide"><summary>Advanced details</summary><label><span>Country code</span><input value={countryCode} onChange={event => setCountryCode(event.target.value)} maxLength={2} placeholder="PK" /></label>
        <label><span>Main city / region</span><input value={city} onChange={event => setCity(event.target.value)} placeholder="Islamabad" /></label>
        <label><span>Province / state <small>Optional</small></span><input value={region} onChange={event => setRegion(event.target.value)} placeholder="Punjab" /></label></details>
        <div className="setup-actions"><button type="button" className="button button--outline" onClick={useCurrent} disabled={busy}><LocateFixed size={16} /> Use current location</button><button type="button" className="button" onClick={() => void save()} disabled={busy || !point}>{busy ? "Saving…" : "Save restaurant location"}</button></div>
      </div>
      <LocationMap label="Restaurant location" point={point} center={point} markerImageUrl={restaurantLogo} onChange={value => void reversePoint(value)} />
    </div>
    {!locationOnly&&<div className="delivery-discovery"><div><span className="eyebrow">CURRENT SERVICE AREA</span><h3>{city || "Choose a city"}</h3><p>{areas.length} active area{areas.length===1?"":"s"}. Provider suggestions are reviewed before import; manual Add Area remains available.</p></div><div className="setup-discovery-actions"><button type="button" className="button button--outline" onClick={() => void lookup("areas")} disabled={busy || !city.trim() || !point}><Sparkles size={16} /> Discover / refresh areas</button></div></div>}
    {candidates.length > 0 && <div className="candidate-list"><div className="candidate-list__header"><strong>{candidates.length} areas found for {city}</strong><div><button type="button" onClick={() => setSelected(candidates.filter(item=>!existingNames.has(item.name.toLowerCase().replace(/[^\p{L}\p{N}]+/gu,""))).map(item => item.providerPlaceId || `${item.slug}:${item.latitude}`))}>Select all new</button><button type="button" onClick={() => setSelected([])}>Clear</button></div></div>{candidates.map(item => { const id = item.providerPlaceId || `${item.slug}:${item.latitude}`; const duplicate = existingNames.has(item.name.toLowerCase().replace(/[^\p{L}\p{N}]+/gu,"")); return <label key={id} className={duplicate ? "is-duplicate" : undefined}><input type="checkbox" disabled={duplicate} checked={selected.includes(id)} onChange={event => setSelected(current => event.target.checked ? [...current, id] : current.filter(value => value !== id))} /><span><strong>{item.name}</strong><small>{item.formattedAddress}{duplicate ? " · already configured" : ""}</small></span></label> })}<div className="setup-actions"><button type="button" className="button button--outline" onClick={()=>void importAreas(candidates.filter(item=>!existingNames.has(item.name.toLowerCase().replace(/[^\p{L}\p{N}]+/gu,""))).map(item=>item.providerPlaceId||`${item.slug}:${item.latitude}`))}>Import all</button><button data-import-areas type="button" className="button" onClick={() => void importAreas()} disabled={busy || selected.length === 0}>Import selected</button></div></div>}
  </section>
}
