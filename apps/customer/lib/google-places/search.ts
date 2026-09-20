import "server-only"

import { googlePlacesFetch, GooglePlacesServiceError } from "@/lib/google-places/client"
import { amsGooglePlacesConfig, getGooglePlacesConfiguration } from "@/lib/google-places/config"
import type { GooglePlaceDetailsResponse, GooglePlacesSearchPlace, GooglePlacesSearchResponse } from "@/lib/google-places/types"

const SEARCH_FIELD_MASK = "places.id,places.displayName,places.formattedAddress,places.location"
const REVIEWS_SEARCH_FIELD_MASK = "places.id,places.displayName,places.rating,places.userRatingCount,places.reviews,places.googleMapsLinks"
const EARTH_RADIUS_METERS = 6_371_000
let resolvedPlaceId: string | null = null
let pendingResolution: Promise<string> | null = null

function stringValue(value: unknown) {
  return typeof value === "string" && value.trim() ? value.trim() : null
}

function numberValue(value: unknown) {
  return typeof value === "number" && Number.isFinite(value) ? value : null
}

function normalizedName(value: string) {
  return value.toLowerCase().replace(/[^a-z0-9]+/g, " ").trim()
}

function distanceMeters(latitude: number, longitude: number) {
  const lat1 = amsGooglePlacesConfig.latitude * Math.PI / 180
  const lat2 = latitude * Math.PI / 180
  const deltaLat = (latitude - amsGooglePlacesConfig.latitude) * Math.PI / 180
  const deltaLon = (longitude - amsGooglePlacesConfig.longitude) * Math.PI / 180
  const a = Math.sin(deltaLat / 2) ** 2 + Math.cos(lat1) * Math.cos(lat2) * Math.sin(deltaLon / 2) ** 2
  return 2 * EARTH_RADIUS_METERS * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a))
}

function candidate(place: GooglePlacesSearchPlace) {
  const id = stringValue(place.id)
  const name = stringValue(place.displayName?.text)
  const latitude = numberValue(place.location?.latitude)
  const longitude = numberValue(place.location?.longitude)
  if (!id || !name || latitude === null || longitude === null) return null
  return { id, name, distance: distanceMeters(latitude, longitude) }
}

function chooseAmsPlace(places: GooglePlacesSearchPlace[]) {
  const expected = normalizedName(amsGooglePlacesConfig.businessName)
  const candidates = places.flatMap((place) => {
    const value = candidate(place)
    return value && value.distance <= amsGooglePlacesConfig.searchRadiusMeters ? [value] : []
  })
  const exact = candidates.filter((item) => normalizedName(item.name) === expected)
  if (exact.length === 1) return exact[0].id
  if (exact.length > 1) {
    throw new GooglePlacesServiceError(
      "Google Places returned multiple exact AMS matches near the configured coordinates.",
      "AMBIGUOUS_PLACE",
      "places-search",
      409,
    )
  }
  const close = candidates.filter((item) => {
    const name = normalizedName(item.name)
    return name.includes("ams") && name.includes("islamic") && name.includes("education")
  })
  if (close.length === 1) return close[0].id
  if (close.length > 1) {
    throw new GooglePlacesServiceError(
      "Google Places returned multiple plausible AMS matches near the configured coordinates.",
      "AMBIGUOUS_PLACE",
      "places-search",
      409,
    )
  }
  throw new GooglePlacesServiceError(
    "AMS ISLAMIC EDUCATION SYSTEM was not found near the configured coordinates.",
    "PLACE_NOT_FOUND",
    "places-search",
    404,
  )
}

function chooseExactAmsPlace(places: GooglePlaceDetailsResponse[]) {
  const expected = normalizedName(amsGooglePlacesConfig.businessName)
  const exact = places.filter((place) => normalizedName(stringValue(place.displayName?.text) ?? "") === expected)
  if (exact.length === 1) return exact[0]
  if (exact.length > 1) {
    throw new GooglePlacesServiceError(
      "Google Places returned multiple exact AMS matches for the reviews fallback.",
      "AMBIGUOUS_PLACE",
      "places-search",
      409,
    )
  }
  throw new GooglePlacesServiceError(
    "The reviews fallback did not return the exact AMS place.",
    "PLACE_NOT_FOUND",
    "places-search",
    404,
  )
}

async function searchForAmsPlaceId() {
  const response = await googlePlacesFetch<GooglePlacesSearchResponse>(
    "https://places.googleapis.com/v1/places:searchText",
    "places-search",
    {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "X-Goog-FieldMask": SEARCH_FIELD_MASK,
      },
      body: JSON.stringify({
        textQuery: amsGooglePlacesConfig.businessName,
        locationBias: {
          circle: {
            center: {
              latitude: amsGooglePlacesConfig.latitude,
              longitude: amsGooglePlacesConfig.longitude,
            },
            radius: amsGooglePlacesConfig.searchRadiusMeters,
          },
        },
        languageCode: "en",
      }),
    },
  )
  return chooseAmsPlace(response.places ?? [])
}

export async function resolveAmsPlaceId() {
  const configuredPlaceId = getGooglePlacesConfiguration().placeId
  if (configuredPlaceId) return { placeId: configuredPlaceId, textSearchUsed: false }
  if (resolvedPlaceId) return { placeId: resolvedPlaceId, textSearchUsed: true }
  if (!pendingResolution) {
    pendingResolution = searchForAmsPlaceId()
      .then((placeId) => {
        resolvedPlaceId = placeId
        return placeId
      })
      .finally(() => { pendingResolution = null })
  }
  return { placeId: await pendingResolution, textSearchUsed: true }
}

export async function searchAmsWithReviews() {
  const response = await googlePlacesFetch<GooglePlacesSearchResponse>(
    "https://places.googleapis.com/v1/places:searchText",
    "places-search",
    {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "X-Goog-FieldMask": REVIEWS_SEARCH_FIELD_MASK,
      },
      body: JSON.stringify({
        textQuery: amsGooglePlacesConfig.businessName,
        locationBias: {
          circle: {
            center: {
              latitude: amsGooglePlacesConfig.latitude,
              longitude: amsGooglePlacesConfig.longitude,
            },
            radius: amsGooglePlacesConfig.searchRadiusMeters,
          },
        },
        languageCode: "en",
      }),
    },
  )
  return chooseExactAmsPlace(response.places ?? [])
}
