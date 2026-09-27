import { normalizeGeoapifyPlace, type GeoapifyPlace } from "./geoapify"
import { distanceMeters, normalizeLocality, validPoint, type Point } from "./location"

export const DELIVERY_DISCOVERY_RADIUS_METERS = 8000
const categories = "populated_place"

/** Provider-backed localities only. A neighbouring town is not excluded by city name. */
export async function discoverNearbyDeliveryAreas(point: Point, apiKey: string, fetcher: typeof fetch = fetch): Promise<GeoapifyPlace[]> {
  if (!validPoint(point) || (point.latitude === 0 && point.longitude === 0)) throw new Error("Choose a valid branch map pin first.")
  if (!apiKey.trim()) throw new Error("Area discovery is not configured. Contact platform support.")
  const signal = AbortSignal.timeout(20000)
  const found = new Map<string, GeoapifyPlace>()
  for (let offset = 0; offset < 4000; offset += 500) {
    const url = new URL("https://api.geoapify.com/v2/places")
    url.search = new URLSearchParams({ categories, filter: `circle:${point.longitude},${point.latitude},${DELIVERY_DISCOVERY_RADIUS_METERS}`, bias: `proximity:${point.longitude},${point.latitude}`, limit: "500", offset: String(offset), lang: "en" }).toString()
    // Keep credentials out of request URLs and exception messages.
    const response = await fetcher(url, { headers: { "x-api-key": apiKey }, cache: "no-store", signal })
    if (!response.ok) throw new Error("Nearby areas could not be loaded. Save or refresh again to retry.")
    const payload = await response.json() as { features?: Array<{ properties?: Record<string, unknown> }> }
    if (!Array.isArray(payload.features)) throw new Error("The location provider returned an invalid response.")
    for (const feature of payload.features) {
      const row = feature.properties ?? {}
      // Places names identify the locality itself; its suburb/district can be its parent.
      const place = normalizeGeoapifyPlace({ ...row, suburb: undefined, neighbourhood: undefined, district: undefined })
      if (!place?.providerPlaceId || distanceMeters(point, place) > DELIVERY_DISCOVERY_RADIUS_METERS || !normalizeLocality(place.name)) continue
      if (!Array.isArray(row.categories) || !row.categories.some(value => typeof value === "string" && value.startsWith("populated_place"))) continue
      found.set(place.providerPlaceId, place)
    }
    if (payload.features.length < 500) return [...found.values()].sort((a, b) => a.name.localeCompare(b.name))
  }
  throw new Error("The provider returned too many areas. No partial import was saved; please retry or contact support.")
}

// A narrow adapter keeps this module independent of an application/service-role client.
export type AreaSyncStore = {
  readBranch: () => Promise<{ id: string; latitude: number | null; longitude: number | null } | null>
  importAreas: (point: Point, candidates: GeoapifyPlace[]) => Promise<number>
}
export async function syncNearbyDeliveryAreas(store: AreaSyncStore, key: string) {
  try {
    const branch = await store.readBranch()
    if (!branch || branch.latitude === null || branch.longitude === null) return { ok: false, count: 0, message: "Branch saved. Choose and save its map pin to automatically add nearby areas within 8 km." }
    const point = { latitude: Number(branch.latitude), longitude: Number(branch.longitude) }
    const candidates = await discoverNearbyDeliveryAreas(point, key)
    const count = await store.importAreas(point, candidates)
    return { ok: true, count, message: candidates.length ? `${count} new nearby areas added within 8 km. Existing areas and delivery charges were preserved.` : "Branch saved. The map provider has no mapped subareas within 8 km; you can add areas manually." }
  } catch {
    return { ok: false, count: 0, message: "Branch saved, but nearby area setup needs a retry. Check the map pin and location provider configuration, then save or refresh areas again." }
  }
}
