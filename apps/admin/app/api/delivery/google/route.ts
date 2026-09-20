import { NextRequest, NextResponse } from "next/server"
import { getAdminContext } from "@/lib/auth"

type Component = { longText?: string; shortText?: string; long_name?: string; short_name?: string; types?: string[] }
type Place = { id?: string; displayName?: { text?: string }; formattedAddress?: string; location?: { latitude?: number; longitude?: number }; addressComponents?: Component[]; primaryTypeDisplayName?: { text?: string } }

function text(value: unknown) { return typeof value === "string" ? value.trim() : "" }
function component(place: Place, types: string[]) { return place.addressComponents?.find((item) => item.types?.some((type) => types.includes(type)))?.longText ?? "" }
function candidate(place: Place) {
  const latitude = place.location?.latitude, longitude = place.location?.longitude
  if (!place.id || typeof latitude !== "number" || typeof longitude !== "number" || !Number.isFinite(latitude) || !Number.isFinite(longitude) || Math.abs(latitude)>90 || Math.abs(longitude)>180 || (latitude===0 && longitude===0)) return null
  return { provider:"google", name: text(place.displayName?.text) || text(place.formattedAddress) || "Google place", slug: (text(place.displayName?.text) || "google-place").toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "").slice(0, 80), providerPlaceId: place.id, formattedAddress: text(place.formattedAddress) || text(place.displayName?.text) || "Selected Google place", latitude, longitude, city: component(place, ["locality", "postal_town", "administrative_area_level_2"]), countryCode: (place.addressComponents?.find((item) => item.types?.includes("country"))?.shortText || "pk").toLowerCase(), countryName: component(place, ["country"]), postalCode: component(place, ["postal_code"]), region: component(place, ["administrative_area_level_1"]), placeType: text(place.primaryTypeDisplayName?.text) }
}

async function googleRequest<T>(pathname: string, init?: RequestInit) {
  const key = process.env.GOOGLE_PLACES_API_KEY?.trim()
  if (!key) throw new Error("Google Places is not configured for Admin.")
  const response = await fetch(`https://places.googleapis.com${pathname}`, { ...init, headers: { ...(init?.headers ?? {}), "X-Goog-Api-Key": key, Accept: "application/json" }, cache: "no-store", signal: AbortSignal.timeout(7_000) })
  if (!response.ok) throw new Error("Google Places request failed.")
  return await response.json() as T
}

export async function GET(request: NextRequest) {
  const context = await getAdminContext()
  if (!context || (context.role !== "OWNER" && !context.permissions.some(p=>["delivery.manage","branches.manage"].includes(p)))) return NextResponse.json({ error: "Delivery access denied." }, { status: 403 })
  const params = request.nextUrl.searchParams
  const mode = params.get("mode") ?? "autocomplete"
  const query = text(params.get("q"))
  const latitude = Number(params.get("latitude")??NaN), longitude = Number(params.get("longitude")??NaN)
  const valid = Number.isFinite(latitude)&&Number.isFinite(longitude)&&Math.abs(latitude)<=90&&Math.abs(longitude)<=180&&!(latitude===0&&longitude===0)
  const countryCode = /^[a-z]{2}$/i.test(params.get("countryCode")??"") ? params.get("countryCode")!.toLowerCase() : "pk"
  try {
    if (mode === "reverse") {
      const key = process.env.GOOGLE_PLACES_API_KEY?.trim()
      if (!key || !valid) return NextResponse.json({ error: "A valid coordinate is required." }, { status: 400 })
      const url = new URL("https://maps.googleapis.com/maps/api/geocode/json")
      url.searchParams.set("latlng", `${latitude},${longitude}`); url.searchParams.set("language", "en"); url.searchParams.set("key", key)
      const response = await fetch(url, { cache: "no-store", signal: AbortSignal.timeout(7_000) })
      if (!response.ok) throw new Error("Google reverse geocoding failed.")
      const payload = await response.json() as { results?: Array<{ formatted_address?: string; address_components?: Component[] }> }
      const result = payload.results?.[0]
      if(!result?.formatted_address) throw new Error("Google could not identify this address.")
      const parts = result?.address_components ?? []
      const find = (types: string[]) => { const item = parts.find((entry) => entry.types?.some((type) => types.includes(type))); return item?.longText ?? item?.long_name ?? "" }
      const country = parts.find((item) => item.types?.includes("country"))
      return NextResponse.json({ candidates: [{ name: find(["establishment"]) || result?.formatted_address || "Selected location", slug: "selected-location", providerPlaceId: null, formattedAddress: result?.formatted_address || `${latitude}, ${longitude}`, latitude, longitude, city: find(["locality", "postal_town", "administrative_area_level_2"]), countryCode: (country?.shortText || country?.short_name || "pk").toLowerCase(), countryName: find(["country"]), postalCode:find(["postal_code"]), region: find(["administrative_area_level_1"]), placeType: "" }] })
    }
    if (mode === "details") {
      const placeId = text(params.get("placeId"))
      if (!placeId) return NextResponse.json({ error: "A place is required." }, { status: 400 })
      const place = await googleRequest<Place>(`/v1/places/${encodeURIComponent(placeId)}?languageCode=en`, { headers: { "X-Goog-FieldMask": "id,displayName,formattedAddress,location,addressComponents,primaryTypeDisplayName" } })
      const item = candidate(place)
      if (!item) return NextResponse.json({ error: "Google returned no usable coordinates." }, { status: 502 })
      return NextResponse.json({ candidate: item }, { headers: { "Cache-Control": "private, no-store" } })
    }
    if (query.length < 2) return NextResponse.json({ candidates: [] })
    const bias = valid ? { locationBias: { circle: { center: { latitude, longitude }, radius: 30_000 } } } : {}
    if (mode === "search") {
      const payload = await googleRequest<{ places?: Place[] }>("/v1/places:searchText", { method: "POST", headers: { "Content-Type": "application/json", "X-Goog-FieldMask": "places.id,places.displayName,places.formattedAddress,places.location,places.addressComponents,places.primaryTypeDisplayName" }, body: JSON.stringify({ textQuery: query, ...bias, languageCode: "en", regionCode: countryCode.toUpperCase(), maxResultCount: 8 }) })
      return NextResponse.json({ candidates: (payload.places ?? []).map(candidate).filter((item): item is NonNullable<ReturnType<typeof candidate>> => Boolean(item)) }, { headers: { "Cache-Control": "private, no-store" } })
    }
    const payload = await googleRequest<{ suggestions?: Array<{ placePrediction?: { placeId?: string; text?: { text?: string }; structuredFormat?: { mainText?: { text?: string }; secondaryText?: { text?: string } } } }> }>("/v1/places:autocomplete", { method: "POST", headers: { "Content-Type": "application/json", "X-Goog-FieldMask": "suggestions.placePrediction.placeId,suggestions.placePrediction.text,suggestions.placePrediction.structuredFormat" }, body: JSON.stringify({ input: query, includedRegionCodes: [countryCode], ...bias }) })
    const suggestions = (payload.suggestions ?? []).flatMap((entry) => { const prediction = entry.placePrediction; if (!prediction?.placeId) return []; return [{ provider:"google", name: prediction.structuredFormat?.mainText?.text ?? prediction.text?.text ?? "Google place", slug: "", providerPlaceId: prediction.placeId, formattedAddress: prediction.structuredFormat?.secondaryText?.text ?? prediction.text?.text ?? "", latitude: null, longitude: null, city: "", countryCode: "pk", region: "", placeType: "" }] })
    return NextResponse.json({ candidates: suggestions }, { headers: { "Cache-Control": "private, no-store" } })
  } catch (error) { return NextResponse.json({ error: error instanceof Error ? error.message : "Google location search is temporarily unavailable." }, { status: 503 }) }
}
