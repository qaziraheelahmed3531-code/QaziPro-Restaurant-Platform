import "server-only"

import { getRestaurantGooglePlacesReviews, type RestaurantReviewContext } from "@/lib/google-places/place-details"
import type { GooglePlacesReviewsPayload } from "@/lib/google-places/types"

// Consult only after hostname/lifecycle resolution. Configuration participates in
// the key so a branch edit cannot accidentally reuse a previous place's reviews.
const entries = new Map<string, { expiresAt: number; value: Promise<GooglePlacesReviewsPayload> }>()
export function getCachedRestaurantGooglePlacesReviews(context: RestaurantReviewContext) {
  const key = JSON.stringify([context.businessId, context.branchId, context.placeId, context.businessName, context.latitude, context.longitude])
  const existing = entries.get(key)
  if (existing && existing.expiresAt > Date.now()) return existing.value
  if (entries.size >= 200) entries.delete(entries.keys().next().value!)
  const value = getRestaurantGooglePlacesReviews(context).catch(error => {
    if (entries.get(key)?.value === value) entries.delete(key)
    throw error
  })
  entries.set(key, { expiresAt: Date.now() + 300_000, value })
  return value
}
