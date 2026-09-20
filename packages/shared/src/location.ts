/** Pure coverage rules shared by customer and Admin. GeoJSON positions are [longitude, latitude]. */
export type LocationSource = "GPS" | "AUTOCOMPLETE" | "MAP_PIN" | "SAVED_ADDRESS" | "MANUAL_AREA"
export type Point = { latitude: number; longitude: number }
export type Boundary = { type: "Polygon"; coordinates: number[][][] } | { type: "MultiPolygon"; coordinates: number[][][][] }
export type CoverageArea = {
  id: string
  parentId?: string | null
  level?: "CITY" | "MAIN_AREA" | "SUB_AREA" | "LOCALITY" | "CUSTOM_ZONE"
  city?: string | null
  countryCode?: string | null
  providerPlaceId?: string | null
  centerLatitude?: number | null
  centerLongitude?: number | null
  serviceRadiusMeters?: number | null
  boundaryGeojson?: unknown
  boundaryType?: "POLYGON" | "RADIUS" | "LOCALITY_MATCH"
}
export function validPoint(point: Point): boolean {
  return typeof point.latitude === "number" && Number.isFinite(point.latitude) && Math.abs(point.latitude) <= 90 && typeof point.longitude === "number" && Number.isFinite(point.longitude) && Math.abs(point.longitude) <= 180
}
export function locationSource(value: unknown): LocationSource {
  return ["GPS", "AUTOCOMPLETE", "MAP_PIN", "SAVED_ADDRESS", "MANUAL_AREA"].includes(String(value)) ? value as LocationSource : "MANUAL_AREA"
}
export function normalizeLocality(value: string) {
  return value.normalize("NFKD").replace(/\p{M}/gu, "").toLowerCase().replace(/[^\p{L}\p{N}]+/gu, " ").trim()
}

export type LocalityCandidate = { source: string; value: string | null | undefined }
export type LocalityMatch<T> = { area: T; sourceField: string; confidence: "exact-canonical" | "exact-alias" | "formatted-token" }

const localitySourceWeight: Record<string, number> = {
  neighbourhood: 1000, suburb: 980, quarter: 960, village: 940,
  district: 920, town: 900, name: 880, municipality: 860,
  street: 840, address_line1: 820, address_line2: 800,
  "formatted-part": 780, formatted: 760, county: 180, city: 160,
}

function containsWholeLocality(candidate: string, areaName: string) {
  if (areaName.length < 4 && !areaName.includes(" ")) return false
  return ` ${candidate} `.includes(` ${areaName} `)
}

/** Matches provider locality labels only against the current branch's DB-backed areas. */
export function matchLocalityCandidates<T extends { label: string; aliases: string[] }>(candidates: LocalityCandidate[], supportedAreas: T[]): LocalityMatch<T> | undefined {
  let best: { match: LocalityMatch<T>; score: number; nameLength: number } | undefined
  const areaNames = supportedAreas.flatMap((area) => [
    { area, normalizedName: normalizeLocality(area.label), alias: false },
    ...area.aliases.map((alias) => ({ area, normalizedName: normalizeLocality(alias), alias: true })),
  ])
  for (const candidate of candidates) {
    const normalizedCandidate = normalizeLocality(candidate.value ?? "")
    if (!normalizedCandidate || candidate.source === "county" || candidate.source === "city") continue
    for (const entry of areaNames) {
      const exact = normalizedCandidate === entry.normalizedName
      const contained = !exact && containsWholeLocality(normalizedCandidate, entry.normalizedName)
      if (!entry.normalizedName || (!exact && !contained)) continue
      const confidence: LocalityMatch<T>["confidence"] = contained ? "formatted-token" : entry.alias ? "exact-alias" : "exact-canonical"
      const methodWeight = contained ? 1000 : entry.alias ? 2000 : 3000
      const score = (localitySourceWeight[candidate.source] ?? 300) * 100 + methodWeight + Math.min(entry.normalizedName.length, 40)
      const proposed = { match: { area: entry.area, sourceField: candidate.source, confidence }, score, nameLength: entry.normalizedName.length }
      if (!best || proposed.score > best.score || (proposed.score === best.score && proposed.nameLength > best.nameLength)) best = proposed
    }
  }
  return best?.match
}
export function parseBoundary(value: unknown): Boundary | null {
  if (!value || typeof value !== "object") return null
  const object = value as Record<string, unknown>
  if (object.type === "Feature") return parseBoundary(object.geometry)
  if (object.type !== "Polygon" && object.type !== "MultiPolygon") return null
  const polygons = object.type === "Polygon" ? [object.coordinates] : object.coordinates
  if (!Array.isArray(polygons) || polygons.length === 0) return null
  let points = 0
  for (const polygon of polygons) {
    if (!Array.isArray(polygon) || polygon.length === 0) return null
    for (const ring of polygon) {
      if (!Array.isArray(ring) || ring.length < 4) return null
      for (const position of ring) {
        if (!Array.isArray(position) || position.length < 2 || !validPoint({ latitude: position[1], longitude: position[0] }) || ++points > 20000) return null
      }
      if (ring[0][0] !== ring[ring.length - 1][0] || ring[0][1] !== ring[ring.length - 1][1]) return null
    }
  }
  return object as Boundary
}
function inRing(point: Point, ring: number[][]) {
  const x = point.longitude, y = point.latitude
  let inside = false
  for (let i = 0, j = ring.length - 1; i < ring.length; j = i++) {
    const [xi, yi] = ring[i], [xj, yj] = ring[j]
    // Include the outer edge; hole edges remain excluded by the caller.
    if (Math.abs((x - xi) * (yj - yi) - (y - yi) * (xj - xi)) < 1e-12 && x >= Math.min(xi, xj) && x <= Math.max(xi, xj) && y >= Math.min(yi, yj) && y <= Math.max(yi, yj)) return true
    if ((yi > y) !== (yj > y) && x < (xj - xi) * (y - yi) / (yj - yi) + xi) inside = !inside
  }
  return inside
}
export function insideBoundary(point: Point, value: unknown) {
  const boundary = parseBoundary(value)
  if (!validPoint(point) || !boundary) return false
  const polygons = boundary.type === "Polygon" ? [boundary.coordinates] : boundary.coordinates
  return polygons.some((rings) => inRing(point, rings[0]) && !rings.slice(1).some((ring) => inRing(point, ring)))
}
export function distanceMeters(a: Point, b: Point) {
  const rad = Math.PI / 180
  const h = Math.sin((b.latitude - a.latitude) * rad / 2) ** 2 + Math.cos(a.latitude * rad) * Math.cos(b.latitude * rad) * Math.sin((b.longitude - a.longitude) * rad / 2) ** 2
  return 6371000 * 2 * Math.asin(Math.sqrt(Math.min(1, h)))
}
export function geometryMatch<T extends CoverageArea>(point: Point, areas: T[]): T | undefined {
  if (!validPoint(point)) return undefined
  const polygon = areas.find((area) => area.boundaryType === "POLYGON" && insideBoundary(point, area.boundaryGeojson))
  if (polygon) return polygon
  // Only configured radii authorize a nearest-center match. No arbitrary distance fallback.
  return areas.filter((area) => area.boundaryType === "RADIUS" && area.centerLatitude != null && area.centerLongitude != null && validPoint({ latitude: area.centerLatitude, longitude: area.centerLongitude }) && (area.serviceRadiusMeters ?? 0) > 0)
    .map((area) => ({ area, distance: distanceMeters(point, { latitude: area.centerLatitude!, longitude: area.centerLongitude! }) }))
    .filter(({ area, distance }) => distance <= area.serviceRadiusMeters!)
    .sort((a, b) => a.distance - b.distance)[0]?.area
}
export function canMatchLocality(area: CoverageArea) {
  return !area.boundaryType || area.boundaryType === "LOCALITY_MATCH"
}
