"use client"

import { useEffect, useRef, useState } from "react"
import { useApp } from "@/components/providers/app-provider"
import { getAddressSuggestions, getPlaceDetails, reverseCurrentLocation } from "@/lib/location/api"
import { getBrowserLocation } from "@/lib/location/get-browser-location"
import { normalizeLocality } from "@italian-pizza/shared/location"
import type { Coordinates } from "@/types"

type Resolved = { point: Coordinates; areaId: string; areaLabel: string; address: string }

export function useCheckoutLocation(onAddress: (value: string) => void) {
  const app = useApp()
  const latest = useRef({ app, onAddress })
  useEffect(() => { latest.current = { app, onAddress } }, [app, onAddress])
  const request = useRef<AbortController | null>(null)
  const initialized = useRef(false)
  const contextKey = `${app.storefront.branch.id}:${app.storefront.branch.locationRevision ?? 1}`
  const previousContext = useRef(contextKey)
  const [point, setPoint] = useState<Coordinates>()
  const [resolved, setResolved] = useState<Resolved>()
  const [busy, setBusy] = useState(false)
  const [message, setMessage] = useState("Search an address or set your exact delivery pin.")
  useEffect(() => () => request.current?.abort(), [])
  useEffect(()=>{
    if(previousContext.current===contextKey)return
    previousContext.current=contextKey;request.current?.abort();initialized.current=false;setPoint(undefined);setResolved(undefined);setBusy(false);setMessage("Search an address or set your exact delivery pin.")
  },[contextKey])

  function invalidate() {
    request.current?.abort()
    setResolved(undefined)
    setBusy(false)
    latest.current.app.clearCoordinates()
    setMessage("Select an address suggestion or confirm a new pin.")
  }
  function accept(value: Resolved) {
    latest.current.onAddress(value.address)
    latest.current.app.selectDetectedArea(value.areaId)
    latest.current.app.setCoordinates(value.point)
    setMessage("We deliver here.")
  }
  async function resolve(coordinates?: Coordinates, suppliedAddress?: string, placeId?: string) {
    request.current?.abort()
    const controller = new AbortController()
    request.current = controller
    setBusy(true)
    setResolved(undefined)
    latest.current.app.clearCoordinates()
    setMessage(coordinates ? "Checking your delivery location…" : "Finding your current location…")
    try {
      const place = placeId ? (await getPlaceDetails(placeId,controller.signal)).suggestion : undefined
      if(placeId && !place?.coordinates) throw new Error("This address has no exact map pin. Please select another result.")
      const value = place?.coordinates ? {...place.coordinates,source:"AUTOCOMPLETE" as const} : coordinates ?? { ...await getBrowserLocation(controller.signal, true), source: "GPS" as const }
      suppliedAddress = place?.description || suppliedAddress
      if (controller.signal.aborted) return
      setPoint(value)
      const result = await reverseCurrentLocation(value, controller.signal)
      if (controller.signal.aborted) return
      latest.current.onAddress(suppliedAddress || result.formattedAddress)
      const area = latest.current.app.storefront.deliveryAreas.find(item => item.id === result.matchedAreaId)
      if (!area) { setMessage("Sorry, this location is outside our delivery area."); return }
      const next = { point: value, areaId: area.id, areaLabel: area.label, address: suppliedAddress || result.formattedAddress }
      setResolved(next)
      latest.current.onAddress(next.address)
      const changed = latest.current.app.selectedAreaId && latest.current.app.selectedAreaId !== area.id
      accept(next)
      if (changed) setMessage(`Delivery area updated to ${area.label}.`)
    } catch (error) {
      if (!controller.signal.aborted) setMessage(error instanceof Error ? error.message : "Location could not be checked. Please retry.")
    } finally {
      if (!controller.signal.aborted) setBusy(false)
    }
  }
  async function loadLegacyAddress(address: string, areaId: string) {
    invalidate()
    setPoint(undefined)
    const controller = new AbortController()
    request.current = controller
    setBusy(true)
    setMessage("Finding a pin for your saved address…")
    try {
      const suggestions = await getAddressSuggestions(address, controller.signal, areaId)
      if (controller.signal.aborted) return
      const exact = suggestions.find(item => normalizeLocality(item.label) === normalizeLocality(address))
      if (exact?.coordinates) { void resolve({ ...exact.coordinates, source: "SAVED_ADDRESS" }, address); return }
      if (exact?.placeId) { void resolve(undefined,address,exact.placeId); return }
      setMessage("Please select a search result or set a pin for this saved address.")
    } catch {
      if (!controller.signal.aborted) setMessage("Set a pin for this saved address, or use current location.")
    } finally { if (!controller.signal.aborted && request.current === controller) setBusy(false) }
  }
  useEffect(() => {
    if (!app.hydrated || initialized.current) return
    let cancelled = false
    const initialPoint = app.coordinates
    if (initialPoint) void Promise.resolve().then(() => { if (!cancelled) { initialized.current = true; void resolve(initialPoint) } })
    return () => { cancelled = true }
    // The saved pin is checked once, never on every quote/state update.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [app.hydrated])
  const mismatch = resolved && app.selectedAreaId !== resolved.areaId
  const valid = !busy && resolved && !mismatch && app.selectedArea && app.coordinates &&
    resolved.point.latitude === app.coordinates.latitude && resolved.point.longitude === app.coordinates.longitude
  return { point, busy, message, mismatch: mismatch ? resolved : undefined,
    coordinates: valid ? resolved.point : undefined,
    resolve, invalidate, loadLegacyAddress,
    confirmSwitch: () => { if (resolved) accept(resolved) },
    retry: () => { if (point) void resolve(point); else void resolve() },
  }
}
