import { NextRequest, NextResponse } from "next/server"
import { getAdminContext } from "@/lib/auth"
import { normalizeGeoapifyPlace } from "@italian-pizza/shared/geoapify"
import { normalizeLocality, validPoint } from "@italian-pizza/shared/location"

type ProviderRow = Record<string, unknown>
const AREA_CATEGORIES = "populated_place.district,populated_place.neighbourhood,populated_place.suburb,populated_place.quarter,populated_place.borough,populated_place.city_block"

async function providerJson(url: URL, signal: AbortSignal) {
  const response = await fetch(url, { cache: "no-store", signal })
  if (!response.ok) throw new Error("provider")
  return response.json() as Promise<{ results?: ProviderRow[]; features?: Array<{ properties?: ProviderRow }> }>
}

export async function GET(request: NextRequest) {
  const context = await getAdminContext()
  if (!context || (context.role !== "OWNER" && !context.permissions.includes("delivery.manage") && !context.permissions.includes("branches.manage"))) return NextResponse.json({ error: "Location access denied." }, { status: 403 })
  const key = process.env.GEOAPIFY_API_KEY?.trim()
  if (!key) return NextResponse.json({ error: "Location search is not configured. Add the server Geoapify key." }, { status: 503 })
  const p = request.nextUrl.searchParams, mode = p.get("mode") ?? "address"
  const latitude = Number(p.get("latitude")), longitude = Number(p.get("longitude"))
  const hasPoint = Boolean(p.get("latitude") && p.get("longitude") && validPoint({ latitude, longitude }))
  const city = (p.get("city") ?? "").trim(), countryCode = (p.get("countryCode") ?? "pk").trim().toLowerCase()
  const query = (p.get("q") ?? "").trim()
  if (mode === "reverse" ? !hasPoint : mode === "areas" ? city.length < 2 || !hasPoint : query.length < 2 || query.length > 200) return NextResponse.json({ error: "Choose a valid point or enter at least two characters." }, { status: 400 })
  const timeout = AbortSignal.any([request.signal, AbortSignal.timeout(12_000)])
  try {
    let rows: ProviderRow[] = []
    if (mode === "areas") {
      const cityUrl = new URL("https://api.geoapify.com/v1/geocode/search")
      new URLSearchParams({ text: city, type: "city", filter: `countrycode:${countryCode}`, bias: `proximity:${longitude},${latitude}`, format: "json", lang: "en", limit: "5", apiKey: key }).forEach((value, name) => cityUrl.searchParams.set(name, value))
      const cityResults = (await providerJson(cityUrl, timeout)).results ?? []
      const normalizedCity = normalizeLocality(city)
      const cityResult = cityResults.find(item => normalizeLocality(String(item.city ?? item.name ?? "")) === normalizedCity) ?? cityResults[0]
      const requests: URL[] = []
      if (typeof cityResult?.place_id === "string") {
        const url = new URL("https://api.geoapify.com/v2/places")
        new URLSearchParams({ categories: AREA_CATEGORIES, filter: `place:${cityResult.place_id}`, bias: `proximity:${longitude},${latitude}`, limit: "250", lang: "en", apiKey: key }).forEach((value, name) => url.searchParams.set(name, value))
        requests.push(url)
      }
      const nearbyUrl = new URL("https://api.geoapify.com/v2/places")
      new URLSearchParams({ categories: AREA_CATEGORIES, filter: `circle:${longitude},${latitude},30000`, bias: `proximity:${longitude},${latitude}`, limit: "250", lang: "en", apiKey: key }).forEach((value, name) => nearbyUrl.searchParams.set(name, value))
      requests.push(nearbyUrl)
      const payloads = await Promise.all(requests.map(url => providerJson(url, timeout)))
      rows = payloads.flatMap(payload => (payload.features ?? []).map(feature => feature.properties ?? {})).filter(item => {
        const candidateCity = normalizeLocality(String(item.city ?? item.municipality ?? item.district ?? ""))
        return candidateCity === normalizedCity || normalizeLocality(String(item.formatted ?? "")).includes(normalizedCity)
      })
    } else {
      const endpoint = mode === "reverse" ? "reverse" : mode === "address" ? "autocomplete" : "search"
      const url = new URL(`https://api.geoapify.com/v1/geocode/${endpoint}`)
      const params = new URLSearchParams({ apiKey: key, format: "json", lang: "en", limit: mode === "reverse" ? "1" : "12" })
      if (mode === "reverse") { params.set("lat", String(latitude)); params.set("lon", String(longitude)) }
      else { params.set("text", query); if (hasPoint) params.set("bias", `proximity:${longitude},${latitude}`); if (countryCode) params.set("filter", `countrycode:${countryCode}`) }
      params.forEach((value, name) => url.searchParams.set(name, value))
      rows = (await providerJson(url, timeout)).results ?? []
    }
    const seen = new Set<string>()
    const candidates = rows.flatMap(row => {
      const result = normalizeGeoapifyPlace(row)
      if (!result) return []
      const normalizedName = normalizeLocality(result.name)
      const coordinateKey = `${result.latitude.toFixed(4)}:${result.longitude.toFixed(4)}`
      const keyValue = result.providerPlaceId || `${normalizedName}:${coordinateKey}`
      if (!normalizedName || seen.has(keyValue) || (mode === "areas" && seen.has(`${normalizedName}:${normalizeLocality(city)}`))) return []
      seen.add(keyValue); if (mode === "areas") seen.add(`${normalizedName}:${normalizeLocality(city)}`)
      return [{ ...result, city: mode === "areas" ? city : result.city }]
    }).sort((first, second) => first.name.localeCompare(second.name, "en", { numeric: true }))
    return NextResponse.json({ mode, city, candidates, count: candidates.length }, { headers: { "Cache-Control": "private, no-store" } })
  } catch {
    return NextResponse.json({ error: "Location search is temporarily unavailable. Please retry." }, { status: 502 })
  }
}
