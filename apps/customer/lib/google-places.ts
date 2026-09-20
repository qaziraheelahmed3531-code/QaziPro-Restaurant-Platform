import "server-only"

import type { AddressSuggestion, ReverseGeocodeResult } from "@/lib/geoapify/types"

type Bias = { latitude: number; longitude: number }
type GoogleComponent = { longText?: string; shortText?: string; long_name?: string; short_name?: string; types?: string[] }
type GooglePlace = { id?: string; displayName?: { text?: string }; formattedAddress?: string; location?: { latitude?: number; longitude?: number }; addressComponents?: GoogleComponent[] }

function key() {
  const value = process.env.GOOGLE_PLACES_API_KEY?.trim()
  if (!value) throw new Error("Google Places is not configured.")
  return value
}

function component(place: GooglePlace, types: string[]) {
  return place.addressComponents?.find((item) => item.types?.some((type) => types.includes(type)))?.longText ?? null
}

async function request<T>(url: string, init?: RequestInit) {
  const response = await fetch(url, { ...init, headers: { ...(init?.headers ?? {}), "X-Goog-Api-Key": key(), Accept: "application/json" }, cache: "no-store", signal: AbortSignal.timeout(7_000) })
  if (!response.ok) throw new Error("Google Places request failed.")
  return await response.json() as T
}

export async function googlePlaceAutocomplete(query: string, bias?: Bias): Promise<AddressSuggestion[]> {
  const body: Record<string, unknown> = { input: query, includedRegionCodes: ["pk"] }
  if (bias) body.locationBias = { circle: { center: { latitude: bias.latitude, longitude: bias.longitude }, radius: 30_000 } }
  const payload = await request<{ suggestions?: Array<{ placePrediction?: { placeId?: string; text?: { text?: string }; structuredFormat?: { mainText?: { text?: string }; secondaryText?: { text?: string } } } }> }>("https://places.googleapis.com/v1/places:autocomplete", { method: "POST", headers: { "Content-Type": "application/json", "X-Goog-FieldMask": "suggestions.placePrediction.placeId,suggestions.placePrediction.text,suggestions.placePrediction.structuredFormat" }, body: JSON.stringify(body) })
  return (payload.suggestions ?? []).flatMap((entry) => {
    const prediction = entry.placePrediction
    if (!prediction?.placeId) return []
    const label = prediction.structuredFormat?.mainText?.text ?? prediction.text?.text ?? "Google place"
    const description = prediction.structuredFormat?.secondaryText?.text ?? prediction.text?.text ?? ""
    return [{ id: prediction.placeId, placeId: prediction.placeId, provider: "google" as const, label, description }]
  })
}

export async function googlePlaceDetails(placeId: string): Promise<{ suggestion: AddressSuggestion; city: string | null; region: string | null; country: string | null; countryCode: string | null; postalCode: string | null }> {
  const place = await request<GooglePlace>(`https://places.googleapis.com/v1/places/${encodeURIComponent(placeId)}?languageCode=en`, { headers: { "X-Goog-FieldMask": "id,displayName,formattedAddress,location,addressComponents" } })
  const latitude = place.location?.latitude, longitude = place.location?.longitude
  if (typeof latitude !== "number" || typeof longitude !== "number" || !Number.isFinite(latitude) || !Number.isFinite(longitude) || Math.abs(latitude)>90 || Math.abs(longitude)>180 || (latitude===0 && longitude===0)) throw new Error("Google place has no usable coordinates.")
  const formattedAddress = place.formattedAddress ?? place.displayName?.text ?? "Selected Google place"
  return {
    suggestion: { id: place.id ?? placeId, placeId: place.id ?? placeId, provider: "google", label: place.displayName?.text ?? formattedAddress, description: formattedAddress, coordinates: { latitude, longitude } },
    city: component(place, ["locality", "postal_town", "administrative_area_level_2"]),
    region: component(place, ["administrative_area_level_1"]),
    country: component(place, ["country"]),
    countryCode: place.addressComponents?.find((item) => item.types?.includes("country"))?.shortText ?? null,
    postalCode: component(place, ["postal_code"]),
  }
}

export async function googleReverseGeocode(latitude: number, longitude: number): Promise<ReverseGeocodeResult> {
  const url = new URL("https://maps.googleapis.com/maps/api/geocode/json")
  url.searchParams.set("latlng", `${latitude},${longitude}`)
  url.searchParams.set("language", "en")
  url.searchParams.set("key", key())
  const response = await fetch(url, { cache: "no-store", signal: AbortSignal.timeout(7_000) })
  if (!response.ok) throw new Error("Google reverse geocoding failed.")
  const payload = await response.json() as { results?: Array<{ formatted_address?: string; address_components?: GoogleComponent[] }> }
  const first = payload.results?.[0]
  if (!first?.formatted_address) throw new Error("Google could not identify this address.")
  const components = first?.address_components ?? []
  const find = (types: string[]) => { const item = components.find((entry) => entry.types?.some((type) => types.includes(type))); return item?.longText ?? item?.long_name ?? null }
  return { formattedAddress: first?.formatted_address ?? `${latitude.toFixed(6)}, ${longitude.toFixed(6)}`, city: find(["locality", "postal_town", "administrative_area_level_2"]), name: null, suburb: find(["sublocality", "sublocality_level_1"]), quarter: null, district: find(["administrative_area_level_2"]), county: null, neighbourhood: find(["neighborhood"]), village: find(["village"]), town: find(["town"]), municipality: null, street: find(["route"]), addressLine1: first?.formatted_address ?? null, addressLine2: null, coordinates: { latitude, longitude }, matchedAreaId: null, matchedAreaLabel: null }
}
