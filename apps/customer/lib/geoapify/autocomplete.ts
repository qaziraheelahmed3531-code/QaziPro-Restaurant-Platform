import "server-only"
import { normalizeGeoapifyPlace } from "@italian-pizza/shared/geoapify"
import { getGeoapifyJson } from "@/lib/geoapify/client"
import type { GeoapifyGeocodingResponse } from "@/lib/geoapify/types"
export async function autocompleteAddress(query: string, _city = "", origin?: { latitude: number; longitude: number }) {
  void _city // Bias uses exact coordinates, not an over-constrained appended city string.
  const params: Record<string,string> = { text:query,format:"json",lang:"en",limit:"6" }
  if(origin) params.bias = `proximity:${origin.longitude},${origin.latitude}`
  const data = await getGeoapifyJson<GeoapifyGeocodingResponse>("/v1/geocode/autocomplete",params)
  const seen = new Set<string>()
  return (data.results ?? []).flatMap(row => { const item = normalizeGeoapifyPlace(row); if(!item || seen.has(item.id))return [];seen.add(item.id);return [item] })
}
