import "server-only"

import { getGooglePlacesConfiguration } from "@/lib/google-places/config"
import type { PublicGoogleReview } from "@/lib/google-places/types"

type LegacyReview = {
  author_name?: unknown
  author_url?: unknown
  profile_photo_url?: unknown
  rating?: unknown
  relative_time_description?: unknown
  text?: unknown
  time?: unknown
}

type LegacyPlaceResult = {
  name?: unknown
  rating?: unknown
  user_ratings_total?: unknown
  reviews?: LegacyReview[]
  url?: unknown
}

type LegacyPlaceResponse = {
  status?: unknown
  error_message?: unknown
  result?: LegacyPlaceResult
}

export type LegacyPlaceDetailsResult = {
  httpStatus: number
  googleStatus: string | null
  errorMessage: string | null
  reviewsFieldPresent: boolean
  rawReviewCount: number
  reviews: PublicGoogleReview[]
  rating: number | null
  totalReviewCount: number | null
}

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
    const isGoogleHost = hostname === "google.com"
      || hostname.endsWith(".google.com")
      || hostname === "googleusercontent.com"
      || hostname.endsWith(".googleusercontent.com")
    return url.protocol === "https:" && isGoogleHost ? url.toString() : null
  } catch {
    return null
  }
}

function safeMessage(value: unknown, apiKey: string) {
  const message = stringValue(value)
  if (!message) return null
  const redacted = apiKey ? message.split(apiKey).join("[redacted]") : message
  return redacted
    .replace(/https?:\/\/\S+/gi, "Google Cloud Console")
    .replace(/\s+/g, " ")
    .trim()
    .slice(0, 400)
}

function publishTime(value: unknown) {
  const seconds = numberValue(value)
  if (seconds === null) return null
  const date = new Date(seconds * 1_000)
  return Number.isNaN(date.getTime()) ? null : date.toISOString()
}

function normalizeLegacyReviews(result: LegacyPlaceResult | undefined) {
  const seen = new Set<string>()
  return (result?.reviews ?? []).flatMap<PublicGoogleReview>((review, index) => {
    const reviewerName = stringValue(review.author_name) ?? "Google user"
    const time = publishTime(review.time)
    const reviewerProfileUrl = publicGoogleUrl(review.author_url)
    const dedupeKey = `${reviewerProfileUrl ?? reviewerName}-${time ?? "undated"}-${index}`
    if (seen.has(dedupeKey)) return []
    seen.add(dedupeKey)
    const rawRating = numberValue(review.rating)
    return [{
      id: null,
      reviewerName,
      reviewerPhotoUrl: publicGoogleUrl(review.profile_photo_url),
      reviewerProfileUrl,
      rating: rawRating !== null && rawRating >= 1 && rawRating <= 5 ? rawRating : null,
      text: stringValue(review.text),
      relativeTime: stringValue(review.relative_time_description),
      publishTime: time,
      googleMapsUri: null,
      source: "google",
    }]
  }).slice(0, 5)
}

async function requestLegacyPlaceDetails(placeId: string, reviewsSort: boolean) {
  const { apiKey } = getGooglePlacesConfiguration()
  if (!apiKey) {
    return { httpStatus: 503, payload: { status: "NOT_CONFIGURED", error_message: "Google Places API key is not configured." } as LegacyPlaceResponse }
  }
  const url = new URL("https://maps.googleapis.com/maps/api/place/details/json")
  url.searchParams.set("place_id", placeId)
  url.searchParams.set("fields", "name,rating,user_ratings_total,reviews,url")
  if (reviewsSort) url.searchParams.set("reviews_sort", "newest")
  url.searchParams.set("key", apiKey)
  try {
    const response = await fetch(url, { cache: "no-store", signal: AbortSignal.timeout(10_000) })
    const payload = await response.json().catch(() => null) as LegacyPlaceResponse | null
    return {
      httpStatus: response.status,
      payload: payload ?? { status: "INVALID_RESPONSE", error_message: "Legacy Places returned invalid JSON." },
    }
  } catch {
    return { httpStatus: 503, payload: { status: "NETWORK_ERROR", error_message: "Legacy Places request could not be completed." } as LegacyPlaceResponse }
  }
}

export async function getLegacyPlaceReviews(placeId: string): Promise<LegacyPlaceDetailsResult> {
  const first = await requestLegacyPlaceDetails(placeId, true)
  const firstStatus = stringValue(first.payload.status)
  const response = firstStatus === "INVALID_REQUEST"
    ? await requestLegacyPlaceDetails(placeId, false)
    : first
  const result = response.payload.result
  const reviewsFieldPresent = Boolean(result && Object.prototype.hasOwnProperty.call(result, "reviews"))
  const reviews = normalizeLegacyReviews(result)
  const { apiKey } = getGooglePlacesConfiguration()
  return {
    httpStatus: response.httpStatus,
    googleStatus: stringValue(response.payload.status),
    errorMessage: safeMessage(response.payload.error_message, apiKey),
    reviewsFieldPresent,
    rawReviewCount: Array.isArray(result?.reviews) ? result.reviews.length : 0,
    reviews,
    rating: numberValue(result?.rating),
    totalReviewCount: numberValue(result?.user_ratings_total),
  }
}
