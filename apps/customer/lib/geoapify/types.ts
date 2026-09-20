export type GeoapifyAddressRecord = {
  place_id?: unknown
  name?: unknown
  formatted?: unknown
  address_line1?: unknown
  address_line2?: unknown
  country?: unknown
  country_code?: unknown
  state?: unknown
  county?: unknown
  city?: unknown
  suburb?: unknown
  quarter?: unknown
  district?: unknown
  neighbourhood?: unknown
  village?: unknown
  town?: unknown
  municipality?: unknown
  street?: unknown
  housenumber?: unknown
  lat?: unknown
  lon?: unknown
  rank?: { confidence?: unknown }
}

export type GeoapifyGeocodingResponse = {
  results?: GeoapifyAddressRecord[]
}

export type GeoapifyRoutingResponse = {
  results?: Array<{ distance?: unknown; time?: unknown }>
}

export type ReverseGeocodeResult = {
  formattedAddress: string
  city: string | null
  name: string | null
  suburb: string | null
  quarter: string | null
  district: string | null
  county: string | null
  neighbourhood: string | null
  village: string | null
  town: string | null
  municipality: string | null
  street: string | null
  addressLine1: string | null
  addressLine2: string | null
  coordinates: { latitude: number; longitude: number }
  matchedAreaId: string | null
  matchedAreaLabel: string | null
  diagnostics?: {
    candidates: string[]
    matchedFrom: string | null
    confidence: string | null
  }
}

export type AddressSuggestion = {
  formattedAddress?: string
  id: string
  label: string
  description: string
  coordinates?: { latitude: number; longitude: number }
  provider?: "google" | "geoapify"
  placeId?: string
}

export type RouteResult = {
  distanceKm: number
  estimatedDurationMinutes: number
}
