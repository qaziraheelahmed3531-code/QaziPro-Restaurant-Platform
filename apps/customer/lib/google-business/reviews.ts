import "server-only"

import { getGoogleBusinessConfig, googleBusinessFetch } from "@/lib/google-business/auth"
import { resolveGoogleBusinessLocationId } from "@/lib/google-business/location"
import type { GoogleReviewApiRecord, GoogleReviewListResponse, PublicGoogleReview } from "@/lib/google-business/types"

const ratingMap: Record<string, number> = { ONE: 1, TWO: 2, THREE: 3, FOUR: 4, FIVE: 5 }

function stringValue(value: unknown) {
  return typeof value === "string" && value.trim() ? value.trim() : null
}

function numberValue(value: unknown) {
  return typeof value === "number" && Number.isFinite(value) ? value : null
}

function starValue(value: unknown) {
  if (typeof value === "number" && value >= 1 && value <= 5) return value
  return typeof value === "string" ? ratingMap[value] ?? null : null
}

export async function getGoogleReviews() {
  const { accountId } = getGoogleBusinessConfig()
  const locationId = await resolveGoogleBusinessLocationId()
  const parent = `accounts/${encodeURIComponent(accountId)}/locations/${encodeURIComponent(locationId)}`
  const records: GoogleReviewApiRecord[] = []
  let averageRating: number | null = null
  let totalReviewCount: number | null = null
  let nextPageToken: string | null = null
  const seenPageTokens = new Set<string>()

  do {
    const url = new URL(`https://mybusiness.googleapis.com/v4/${parent}/reviews`)
    url.searchParams.set("pageSize", "50")
    if (nextPageToken) url.searchParams.set("pageToken", nextPageToken)
    const data = await googleBusinessFetch<GoogleReviewListResponse>(url.toString(), "reviews")
    records.push(...(data.reviews ?? []))
    averageRating ??= numberValue(data.averageRating)
    totalReviewCount ??= numberValue(data.totalReviewCount)
    const returnedToken = stringValue(data.nextPageToken)
    if (!returnedToken || seenPageTokens.has(returnedToken)) {
      nextPageToken = null
    } else {
      seenPageTokens.add(returnedToken)
      nextPageToken = returnedToken
    }
  } while (nextPageToken && seenPageTokens.size < 20)

  const seen = new Set<string>()
  const reviews = records.flatMap<PublicGoogleReview>((review) => {
    const name = stringValue(review.name)
    const reviewId = stringValue(review.reviewId) ?? name?.split("/").at(-1) ?? null
    const reviewerName = stringValue(review.reviewer?.displayName)
    const starRating = starValue(review.starRating)
    if (!reviewId || !reviewerName || starRating === null || seen.has(reviewId)) return []
    seen.add(reviewId)
    const reviewerPhotoUrl = stringValue(review.reviewer?.profilePhotoUrl)
    return [{
      reviewId,
      reviewerName,
      ...(reviewerPhotoUrl ? { reviewerPhotoUrl } : {}),
      starRating,
      comment: stringValue(review.comment) ?? "",
      createTime: stringValue(review.createTime),
      updateTime: stringValue(review.updateTime),
    }]
  })
  return {
    reviews,
    averageRating,
    totalReviewCount,
    hasMore: Boolean(nextPageToken),
  }
}
