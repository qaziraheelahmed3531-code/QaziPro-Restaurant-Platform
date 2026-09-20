import "server-only"

import { amsGooglePlacesConfig } from "@/lib/google-places/config"
import type { SociableKitFeedPayload, SociableKitReview, SociableKitReviewsResult } from "@/lib/google-reviews/types"

const CACHE_MS = 10 * 60 * 1_000
let cache: { expiresAt: number; value: SociableKitReviewsResult } | null = null
let pending: Promise<SociableKitReviewsResult> | null = null

function stringValue(value: unknown) {
  return typeof value === "string" && value.trim() ? value.trim() : null
}

function reviewText(value: unknown) {
  return typeof value === "string" && value.length > 0 ? value : null
}

function ratingValue(value: unknown) {
  const rating = typeof value === "number" ? value : typeof value === "string" ? Number(value) : Number.NaN
  return Number.isFinite(rating) && rating >= 1 && rating <= 5 ? rating : null
}

function publicImageUrl(value: unknown) {
  const text = stringValue(value)
  if (!text) return null
  try {
    const url = new URL(text)
    return url.protocol === "https:" ? url.toString() : null
  } catch {
    return null
  }
}

function normalizedName(value: string) {
  return value.toLowerCase().replace(/[^a-z0-9]+/g, " ").trim()
}

function normalizeReviews(payload: SociableKitFeedPayload) {
  const seen = new Set<string>()
  return (payload.reviews ?? []).flatMap<SociableKitReview>((review) => {
    const id = stringValue(review.id)
    const reviewerName = stringValue(review.reviewer_name) ?? "Google user"
    const reviewDate = stringValue(review.review_date_time)
    const text = reviewText(review.review_text)
    const rating = ratingValue(review.rating)
    const dedupeKey = id ?? `${reviewerName}-${reviewDate ?? "undated"}-${rating ?? "unrated"}-${text ?? "no-text"}`
    if (seen.has(dedupeKey)) return []
    seen.add(dedupeKey)
    return [{
      id,
      reviewerName,
      reviewerPhotoUrl: publicImageUrl(review.reviewer_photo_url ?? review.reviewer_photo ?? review.profile_photo_url),
      rating,
      text,
      reviewDate,
      source: "google",
    }]
  })
}

function emptyResult(overrides?: Partial<SociableKitReviewsResult>): SociableKitReviewsResult {
  return {
    configured: false,
    httpStatus: null,
    reviews: [],
    lastSyncInfo: null,
    errorCode: "NOT_CONFIGURED",
    errorMessage: "SociableKIT Google Reviews feed is not configured.",
    ...overrides,
  }
}

async function loadSociableKitReviews(): Promise<SociableKitReviewsResult> {
  const feedUrl = process.env.SOCIABLEKIT_GOOGLE_REVIEWS_FEED_URL?.trim()
  if (!feedUrl) return emptyResult()
  try {
    const url = new URL(feedUrl)
    if (url.protocol !== "https:") {
      return emptyResult({ configured: true, httpStatus: 422, errorCode: "INVALID_FEED_URL", errorMessage: "SociableKIT feed URL must use HTTPS." })
    }
  } catch {
    return emptyResult({ configured: true, httpStatus: 422, errorCode: "INVALID_FEED_URL", errorMessage: "SociableKIT feed URL is invalid." })
  }

  let response: Response
  try {
    response = await fetch(feedUrl, {
      headers: { Accept: "application/json" },
      cache: "no-store",
      signal: AbortSignal.timeout(10_000),
    })
  } catch {
    return emptyResult({ configured: true, httpStatus: 503, errorCode: "NETWORK_ERROR", errorMessage: "SociableKIT feed request could not be completed." })
  }

  const body = await response.text()
  let payload: SociableKitFeedPayload | null = null
  try {
    const parsed = JSON.parse(body.replace(/^\uFEFF/, "").trim())
    payload = typeof parsed === "object" && parsed !== null ? parsed as SociableKitFeedPayload : null
  } catch {
    payload = null
  }
  if (!response.ok) {
    return emptyResult({ configured: true, httpStatus: response.status, errorCode: `HTTP_${response.status}`, errorMessage: "SociableKIT feed request failed." })
  }
  if (!payload || !Array.isArray(payload.reviews)) {
    return emptyResult({ configured: true, httpStatus: response.status, errorCode: "INVALID_FEED_FORMAT", errorMessage: "SociableKIT URL did not return a Google Reviews JSON feed." })
  }

  const feedBusinessName = stringValue(payload.bio?.name)
  if (!feedBusinessName || normalizedName(feedBusinessName) !== normalizedName(amsGooglePlacesConfig.businessName)) {
    return emptyResult({ configured: true, httpStatus: response.status, errorCode: "BUSINESS_MISMATCH", errorMessage: "SociableKIT feed does not identify the configured AMS business." })
  }
  return {
    configured: true,
    httpStatus: response.status,
    reviews: normalizeReviews(payload),
    lastSyncInfo: stringValue(payload.last_sync_info),
    errorCode: null,
    errorMessage: null,
  }
}

export async function getCachedSociableKitReviews() {
  if (cache && cache.expiresAt > Date.now()) return cache.value
  if (!pending) {
    pending = loadSociableKitReviews()
      .then((value) => {
        cache = { expiresAt: Date.now() + CACHE_MS, value }
        return value
      })
      .finally(() => { pending = null })
  }
  return pending
}

export function clearSociableKitReviewsCacheForDevelopment() {
  if (process.env.NODE_ENV !== "development") return false
  cache = null
  pending = null
  return true
}
