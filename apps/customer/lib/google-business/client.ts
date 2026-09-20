import "server-only"

import { getConfiguredGoogleBusinessReviewUrl, temporaryGoogleReviewsConfig } from "@/lib/google-business/review-config"
import { getGoogleReviews } from "@/lib/google-business/reviews"
import type { GoogleReviewsPayload } from "@/lib/google-business/types"

const CACHE_MS = 5 * 60 * 1_000
let cache: { expiresAt: number; value: GoogleReviewsPayload } | null = null
let pending: Promise<GoogleReviewsPayload> | null = null

async function loadGoogleReviews(): Promise<GoogleReviewsPayload> {
  const summary = await getGoogleReviews()
  return {
    ok: true,
    available: true,
    businessName: temporaryGoogleReviewsConfig.businessName,
    ...summary,
    mapsUrl: temporaryGoogleReviewsConfig.mapsUrl,
    newReviewUrl: getConfiguredGoogleBusinessReviewUrl(),
  }
}

export async function getCachedGoogleReviews() {
  if (cache && cache.expiresAt > Date.now()) return cache.value
  if (!pending) {
    pending = loadGoogleReviews()
      .then((value) => {
        cache = { expiresAt: Date.now() + CACHE_MS, value }
        return value
      })
      .finally(() => { pending = null })
  }
  return pending
}

export function clearGoogleReviewsCacheForDevelopment() {
  if (process.env.NODE_ENV !== "development") return false
  cache = null
  pending = null
  return true
}
