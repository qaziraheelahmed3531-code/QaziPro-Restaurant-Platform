import "server-only"

import { canMatchLocality, geometryMatch, matchLocalityCandidates } from "@italian-pizza/shared/location"
import { asNumber, asString, GeoapifyServiceError, getGeoapifyJson } from "@/lib/geoapify/client"
import type { GeoapifyGeocodingResponse, ReverseGeocodeResult } from "@/lib/geoapify/types"
import type { LocationArea } from "@/types"

export async function reverseGeocode(latitude: number, longitude: number, supportedAreas?: LocationArea[]): Promise<ReverseGeocodeResult> {
  const data = await getGeoapifyJson<GeoapifyGeocodingResponse>("/v1/geocode/reverse", {
    lat: String(latitude),
    lon: String(longitude),
    format: "json",
    lang: "en",
    limit: "1",
  })
  const result = data.results?.[0]
  if (!result) throw new GeoapifyServiceError("No address was found for this location.", "invalid-response")

  const resolvedLatitude = asNumber(result.lat)
  const resolvedLongitude = asNumber(result.lon)
  if (resolvedLatitude === null || resolvedLongitude === null) {
    throw new GeoapifyServiceError("Location provider omitted coordinates.", "invalid-response")
  }

  const city = asString(result.city)
  const name = asString(result.name)
  const suburb = asString(result.suburb)
  const quarter = asString(result.quarter)
  const district = asString(result.district)
  const county = asString(result.county)
  const neighbourhood = asString(result.neighbourhood)
  const village = asString(result.village)
  const town = asString(result.town)
  const municipality = asString(result.municipality)
  const street = asString(result.street)
  const addressLine1 = asString(result.address_line1)
  const addressLine2 = asString(result.address_line2)
  const formattedAddress = asString(result.formatted)
  const candidates = [
    { source: "neighbourhood", value: neighbourhood },
    { source: "suburb", value: suburb },
    { source: "quarter", value: quarter },
    { source: "village", value: village },
    { source: "district", value: district },
    { source: "town", value: town },
    { source: "name", value: name },
    { source: "municipality", value: municipality },
    { source: "street", value: street },
    { source: "address_line1", value: addressLine1 },
    { source: "address_line2", value: addressLine2 },
    ...(formattedAddress?.split(/[,;/|]/).map((value) => ({ source: "formatted-part", value })) ?? []),
    { source: "formatted", value: formattedAddress },
    { source: "county", value: county },
    { source: "city", value: city },
  ]
  const geometryArea = geometryMatch({ latitude, longitude }, supportedAreas ?? [])
  const match = matchLocalityCandidates(candidates, (supportedAreas ?? []).filter(canMatchLocality))
  // Geoapify may snap reverse results to a building centroid; never move the requested pin.
  const matchedArea = geometryArea ?? match?.area
  const diagnostics = {
    candidates: Array.from(new Set(candidates.map((candidate) => candidate.value?.trim()).filter((value): value is string => Boolean(value)))),
    matchedFrom: match?.sourceField ?? null,
    confidence: match?.confidence ?? null,
  }

  return {
    formattedAddress: formattedAddress ?? "Detected location",
    city,
    name,
    suburb,
    quarter,
    district,
    county,
    neighbourhood,
    village,
    town,
    municipality,
    street,
    addressLine1,
    addressLine2,
    coordinates: { latitude, longitude },
    matchedAreaId: matchedArea?.id ?? null,
    matchedAreaLabel: matchedArea?.label ?? null,
    ...(process.env.NODE_ENV === "development" ? { diagnostics } : {}),
  }
}
