"use client"

import { useEffect, useId, useRef, useState } from "react"
import { LocateFixed, MapPin, Search } from "lucide-react"
import { LocationPickerMap } from "@italian-pizza/shared/location-picker-map"
import { validPoint, type Point } from "@italian-pizza/shared/location"

export type BranchLocationValue = {
  phone?: string | null
  address?: string | null
  city?: string | null
  region?: string | null
  countryCode?: string | null
  countryName?: string | null
  postalCode?: string | null
  latitude?: number | null
  longitude?: number | null
  locationProvider?: string | null
  providerPlaceId?: string | null
  locationName?: string | null
}

type Candidate = {
  id: string
  name: string
  formattedAddress: string
  city: string
  region: string
  countryCode: string
  countryName: string
  postalCode: string
  latitude: number
  longitude: number
  provider: "geoapify"
  providerPlaceId: string | null
}

function fieldName(prefix: string, field: string, index?: number) {
  if (!prefix) return field
  return `${prefix}${field[0].toUpperCase()}${field.slice(1)}${index ?? ""}`
}

function initialPoint(value?: BranchLocationValue): Point | undefined {
  const point = { latitude: Number(value?.latitude), longitude: Number(value?.longitude) }
  return value?.latitude != null && value.longitude != null && validPoint(point) ? point : undefined
}

export function BranchLocationFields({ prefix = "", index, initial, required = true }: { prefix?: string; index?: number; initial?: BranchLocationValue; required?: boolean }) {
  const id = useId().replaceAll(":", "")
  const [phone, setPhone] = useState(initial?.phone ?? "")
  const [address, setAddress] = useState(initial?.address ?? "")
  const [city, setCity] = useState(initial?.city ?? "")
  const [region, setRegion] = useState(initial?.region ?? "")
  const [countryCode, setCountryCode] = useState((initial?.countryCode ?? "PK").toUpperCase())
  const [countryName, setCountryName] = useState(initial?.countryName ?? "Pakistan")
  const [postalCode, setPostalCode] = useState(initial?.postalCode ?? "")
  const [point, setPoint] = useState<Point | undefined>(() => initialPoint(initial))
  const [providerPlaceId, setProviderPlaceId] = useState(initial?.providerPlaceId ?? "")
  const [locationName, setLocationName] = useState(initial?.locationName ?? "")
  const [query, setQuery] = useState("")
  const [suggestions, setSuggestions] = useState<Candidate[]>([])
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState("")
  const controller = useRef<AbortController | null>(null)

  useEffect(() => () => controller.current?.abort(), [])

  async function lookup(mode: "autocomplete" | "reverse", nextQuery = query, nextPoint = point) {
    controller.current?.abort()
    const requestController = new AbortController()
    controller.current = requestController
    const params = new URLSearchParams({ mode, countryCode: countryCode.toLowerCase() })
    if (mode === "autocomplete") params.set("q", nextQuery.trim())
    if (mode === "reverse" && nextPoint) {
      params.set("latitude", String(nextPoint.latitude))
      params.set("longitude", String(nextPoint.longitude))
    }
    setBusy(true)
    setError("")
    try {
      const response = await fetch(`/api/location?${params}`, { cache: "no-store", signal: requestController.signal })
      const body = await response.json() as { candidates?: Candidate[]; error?: string }
      if (!response.ok) throw new Error(body.error || "Location lookup is unavailable.")
      const candidates = body.candidates ?? []
      if (mode === "reverse") {
        if (!candidates[0]) throw new Error("No address was found for this map point.")
        choose(candidates[0], false)
      } else setSuggestions(candidates)
    } catch (lookupError) {
      if (!requestController.signal.aborted) setError(lookupError instanceof Error ? lookupError.message : "Location lookup is unavailable.")
    } finally {
      if (!requestController.signal.aborted) setBusy(false)
    }
  }

  function choose(candidate: Candidate, clearQuery = true) {
    setAddress(candidate.formattedAddress)
    setCity(candidate.city || city)
    setRegion(candidate.region || "")
    setCountryCode((candidate.countryCode || countryCode).toUpperCase())
    setCountryName(candidate.countryName || "")
    setPostalCode(candidate.postalCode || "")
    setPoint({ latitude: candidate.latitude, longitude: candidate.longitude })
    setProviderPlaceId(candidate.providerPlaceId || "")
    setLocationName(candidate.name)
    setSuggestions([])
    if (clearQuery) setQuery(candidate.formattedAddress)
    setError("")
  }

  function useCurrentLocation() {
    if (!window.isSecureContext || !navigator.geolocation) {
      setError("Current location is unavailable. Search an address or choose a point on the map.")
      return
    }
    setBusy(true)
    setError("")
    navigator.geolocation.getCurrentPosition(
      ({ coords }) => {
        const next = { latitude: coords.latitude, longitude: coords.longitude }
        setPoint(next)
        void lookup("reverse", "", next)
      },
      () => {
        setBusy(false)
        setError("Location permission was denied. Search an address or choose a point on the map instead.")
      },
      { enableHighAccuracy: true, timeout: 12_000, maximumAge: 0 },
    )
  }

  function updatePoint(next: Point) {
    setPoint(next)
    setProviderPlaceId("")
    setLocationName("")
    void lookup("reverse", "", next)
  }

  const names = {
    phone: fieldName(prefix, "phone", index), address: fieldName(prefix, "address", index), city: fieldName(prefix, "city", index),
    region: fieldName(prefix, "region", index), countryCode: fieldName(prefix, "countryCode", index), countryName: fieldName(prefix, "countryName", index),
    postalCode: fieldName(prefix, "postalCode", index), latitude: fieldName(prefix, "latitude", index), longitude: fieldName(prefix, "longitude", index),
    locationProvider: fieldName(prefix, "locationProvider", index), providerPlaceId: fieldName(prefix, "providerPlaceId", index), locationName: fieldName(prefix, "locationName", index),
  }

  return <div className="branch-location-fields">
    <p className="form-help span-2">Saving this branch with a map pin automatically adds provider-mapped subareas within 8 km. Existing areas and delivery charges are preserved.</p>
    <label className="span-2">Find the branch address<div className="location-search-row"><input value={query} onChange={(event) => { setQuery(event.target.value); setSuggestions([]) }} onKeyDown={(event) => { if (event.key === "Enter") { event.preventDefault(); if (query.trim().length >= 2) void lookup("autocomplete") } }} placeholder="Search a business, street or address" aria-controls={`${id}-suggestions`} aria-expanded={suggestions.length > 0} role="combobox"/><button type="button" className="button button-secondary" disabled={busy || query.trim().length < 2} onClick={() => void lookup("autocomplete")}><Search/>Search</button></div></label>
    {suggestions.length ? <div className="location-suggestions span-2" id={`${id}-suggestions`} role="listbox">{suggestions.map((candidate) => <button type="button" role="option" aria-selected="false" key={candidate.id} onClick={() => choose(candidate)}><MapPin/><span><strong>{candidate.name}</strong><small>{candidate.formattedAddress}</small></span></button>)}</div> : null}
    {error ? <p className="inline-field-error span-2" role="alert">{error}</p> : null}
    <label>Branch phone<input name={names.phone} value={phone} onChange={(event) => setPhone(event.target.value)} inputMode="tel"/></label>
    <label>City<input name={names.city} value={city} onChange={(event) => setCity(event.target.value)} required={required}/></label>
    <label className="span-2">Address<input name={names.address} value={address} onChange={(event) => setAddress(event.target.value)} required={required}/></label>
    <label>Region / province<input name={names.region} value={region} onChange={(event) => setRegion(event.target.value)}/></label>
    <label>Postal code<input name={names.postalCode} value={postalCode} onChange={(event) => setPostalCode(event.target.value)}/></label>
    <label>Country code<input name={names.countryCode} value={countryCode} onChange={(event) => setCountryCode(event.target.value.toUpperCase())} required={required} maxLength={2}/></label>
    <label>Country<input name={names.countryName} value={countryName} onChange={(event) => setCountryName(event.target.value)}/></label>
    <input type="hidden" name={names.latitude} value={point?.latitude ?? ""}/><input type="hidden" name={names.longitude} value={point?.longitude ?? ""}/>
    <input type="hidden" name={names.locationProvider} value={point ? "geoapify" : ""}/><input type="hidden" name={names.providerPlaceId} value={providerPlaceId}/><input type="hidden" name={names.locationName} value={locationName}/>
    <div className="span-2 location-actions"><button type="button" className="button button-secondary" disabled={busy} onClick={useCurrentLocation}><LocateFixed/>Use current location</button><small>{point ? `${point.latitude.toFixed(6)}, ${point.longitude.toFixed(6)}` : "Coordinates will be saved only after you choose a real location."}</small></div>
    <div className="span-2"><LocationPickerMap label="Branch location" point={point} center={point} onChange={updatePoint} height={280} audience="admin" tileKey={process.env.NEXT_PUBLIC_GEOAPIFY_MAPS_KEY ?? ""}/></div>
  </div>
}
