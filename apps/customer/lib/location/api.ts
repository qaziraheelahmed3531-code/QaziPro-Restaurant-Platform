import type { AddressSuggestion, ReverseGeocodeResult } from "@/lib/geoapify/types"
import type { Coordinates, DeliveryQuote } from "@/types"

async function getJson<T>(url: URL, signal?: AbortSignal): Promise<T> {
  const response = await fetch(url, { signal, headers: { Accept: "application/json" } })
  const payload = await response.json().catch(() => null) as { error?: string } | null
  if (!response.ok) throw new Error(payload?.error ?? "The location service is temporarily unavailable.")
  return payload as T
}

function apiUrl(pathname: string) {
  return new URL(pathname, window.location.origin)
}

export function reverseCurrentLocation(coordinates: Coordinates, signal?: AbortSignal) {
  const url = apiUrl("/api/location/reverse")
  url.searchParams.set("latitude", String(coordinates.latitude))
  url.searchParams.set("longitude", String(coordinates.longitude))
  return getJson<ReverseGeocodeResult>(url, signal)
}

export async function getAddressSuggestions(query: string, signal?: AbortSignal, areaId?: string) {
  const url = apiUrl("/api/location/autocomplete")
  url.searchParams.set("q", query)
  if (areaId) url.searchParams.set("areaId", areaId)
  const payload = await getJson<{ suggestions: AddressSuggestion[] }>(url, signal)
  return payload.suggestions
}

export function getPlaceDetails(placeId: string, signal?: AbortSignal) {
  const url = apiUrl("/api/location/place")
  url.searchParams.set("placeId", placeId)
  return getJson<{ suggestion: AddressSuggestion; city: string | null; region: string | null; country: string | null; countryCode: string | null; postalCode: string | null }>(url, signal)
}

export function getDeliveryQuote(coordinates: Coordinates, signal?: AbortSignal, areaId?: string) {
  const url = apiUrl("/api/location/route")
  if (areaId) url.searchParams.set("areaId", areaId)
  url.searchParams.set("latitude", String(coordinates.latitude))
  url.searchParams.set("longitude", String(coordinates.longitude))
  return getJson<DeliveryQuote>(url, signal)
}
