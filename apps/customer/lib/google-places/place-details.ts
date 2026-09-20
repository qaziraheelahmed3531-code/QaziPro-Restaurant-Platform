import "server-only"

import { googlePlacesFetch, GooglePlacesServiceError } from "@/lib/google-places/client"
import { amsGooglePlacesConfig } from "@/lib/google-places/config"
import { resolveAmsPlaceId } from "@/lib/google-places/search"
import type {
  GoogleMapsLinks,
  GooglePlaceDetailsResponse,
  GooglePlacesReviewsPayload,
  PublicGoogleReview,
} from "@/lib/google-places/types"

const DETAILS_FIELD_MASK = "id,displayName,formattedAddress,location,rating,userRatingCount,reviews,googleMapsLinks"
const EARTH_RADIUS_METERS = 6_371_000

function stringValue(value: unknown) {
  return typeof value === "string" && value.trim() ? value.trim() : null
}

function numberValue(value: unknown) {
  return typeof value === "number" && Number.isFinite(value) ? value : null
}

function publicGoogleUrl(value: unknown) {
  const text = stringValue(value)
  if (!text) return null
  try {
    const url = new URL(text)
    const hostname = url.hostname.toLowerCase()
    const googleHost = hostname === "google.com"
      || hostname.endsWith(".google.com")
      || hostname === "googleusercontent.com"
      || hostname.endsWith(".googleusercontent.com")
      || hostname === "goo.gl"
      || hostname.endsWith(".goo.gl")
    return url.protocol === "https:" && googleHost ? url.toString() : null
  } catch {
    return null
  }
}

function normalizedName(value: string) {
  return value.toLowerCase().replace(/[^a-z0-9]+/g, " ").trim()
}

function distanceFromAms(latitude: number, longitude: number) {
  const lat1 = amsGooglePlacesConfig.latitude * Math.PI / 180
  const lat2 = latitude * Math.PI / 180
  const deltaLat = (latitude - amsGooglePlacesConfig.latitude) * Math.PI / 180
  const deltaLon = (longitude - amsGooglePlacesConfig.longitude) * Math.PI / 180
  const a = Math.sin(deltaLat / 2) ** 2 + Math.cos(lat1) * Math.cos(lat2) * Math.sin(deltaLon / 2) ** 2
  return 2 * EARTH_RADIUS_METERS * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a))
}

function verifyAmsPlace(details: GooglePlaceDetailsResponse) {
  const businessName = stringValue(details.displayName?.text)
  const latitude = numberValue(details.location?.latitude)
  const longitude = numberValue(details.location?.longitude)
  const expected = normalizedName(amsGooglePlacesConfig.businessName)
  const actual = businessName ? normalizedName(businessName) : ""
  const nameMatches = actual === expected || (actual.includes("ams") && actual.includes("islamic") && actual.includes("education"))
  const locationMatches = latitude !== null
    && longitude !== null
    && distanceFromAms(latitude, longitude) <= amsGooglePlacesConfig.searchRadiusMeters
  if (!businessName || !nameMatches || !locationMatches) {
    throw new GooglePlacesServiceError(
      "The resolved Google Place does not match AMS ISLAMIC EDUCATION SYSTEM near the configured coordinates.",
      "PLACE_MISMATCH",
      "parsing",
      422,
    )
  }
  return businessName
}

function normalizeLinks(details: GooglePlaceDetailsResponse): GoogleMapsLinks {
  return {
    placeUri: publicGoogleUrl(details.googleMapsLinks?.placeUri),
    reviewsUri: publicGoogleUrl(details.googleMapsLinks?.reviewsUri),
    writeAReviewUri: publicGoogleUrl(details.googleMapsLinks?.writeAReviewUri),
  }
}

function normalizeReviews(details: GooglePlaceDetailsResponse) {
  const seen = new Set<string>()
  return (details.reviews ?? []).flatMap<PublicGoogleReview>((review, index) => {
    const rawRating = numberValue(review.rating)
    const reviewerName = stringValue(review.authorAttribution?.displayName) ?? "Google user"
    const publishTime = stringValue(review.publishTime)
    const googleMapsUri = publicGoogleUrl(review.googleMapsUri)
    const id = stringValue(review.name) ?? googleMapsUri
    const dedupeKey = id ?? `${reviewerName}-${publishTime ?? "undated"}-${index}`
    if (seen.has(dedupeKey)) return []
    seen.add(dedupeKey)
    return [{
      id,
      reviewerName,
      reviewerPhotoUrl: publicGoogleUrl(review.authorAttribution?.photoUri),
      reviewerProfileUrl: publicGoogleUrl(review.authorAttribution?.uri),
      rating: rawRating !== null && rawRating >= 1 && rawRating <= 5 ? rawRating : null,
      text: stringValue(review.text?.text) ?? stringValue(review.originalText?.text),
      relativeTime: stringValue(review.relativePublishTimeDescription),
      publishTime,
      googleMapsUri,
      source: "google",
    }]
  }).slice(0, 5)
}

export async function getAmsGooglePlacesReviews(): Promise<GooglePlacesReviewsPayload> {
  const { placeId, textSearchUsed } = await resolveAmsPlaceId()
  const details = await googlePlacesFetch<GooglePlaceDetailsResponse>(
    `https://places.googleapis.com/v1/places/${encodeURIComponent(placeId)}?languageCode=en`,
    "place-details",
    { headers: { "X-Goog-FieldMask": DETAILS_FIELD_MASK } },
  )
  const businessName = verifyAmsPlace(details)
  const rawReviewsFieldPresent = Object.prototype.hasOwnProperty.call(details, "reviews")
  const rawReviewsCount = Array.isArray(details.reviews) ? details.reviews.length : 0
  const newReviews = normalizeReviews(details)
  return {
    ok: true,
    available: true,
    source: "google-places-new",
    businessName,
    rating: numberValue(details.rating),
    totalReviewCount: numberValue(details.userRatingCount),
    reviews: newReviews,
    googleMapsLinks: normalizeLinks(details),
    textSearchUsed,
    ...(process.env.NODE_ENV === "development" ? {
      diagnostics: {
        rawReviewsFieldPresent,
        rawReviewsCount,
        normalizedReviewsCount: newReviews.length,
        textSearchRawReviewsCount: 0,
        legacyHttpStatus: null,
        legacyGoogleStatus: null,
        legacyReviewsFieldPresent: false,
        legacyRawReviewCount: 0,
        legacyNormalizedReviewCount: 0,
        placesWorking: true,
        sociableKitConfigured: Boolean(process.env.SOCIABLEKIT_GOOGLE_REVIEWS_FEED_URL?.trim()),
        sociableKitHttpStatus: null,
        sociableKitReviewCount: 0,
        finalReviewCount: newReviews.length,
        sociableKitErrorCode: null,
        sociableKitErrorMessage: null,
      },
    } : {}),
  }
}
