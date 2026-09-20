import "server-only"

import { getAmsGooglePlacesReviews } from "@/lib/google-places/place-details"
import type { GooglePlacesReviewsPayload } from "@/lib/google-places/types"

const CACHE_MS = 5 * 60 * 1_000
let cache: { expiresAt: number; value: GooglePlacesReviewsPayload } | null = null
let pending: Promise<GooglePlacesReviewsPayload> | null = null

export async function getCachedAmsGooglePlacesReviews() {
  if (cache && cache.expiresAt > Date.now()) return cache.value
  if (!pending) {
    pending = getAmsGooglePlacesReviews()
      .then((value) => {
        cache = { expiresAt: Date.now() + CACHE_MS, value }
        return value
      })
      .finally(() => { pending = null })
  }
  return pending
}

export function clearGooglePlacesReviewsCacheForDevelopment() {
  if (process.env.NODE_ENV !== "development") return false
  cache = null
  pending = null
  return true
}
