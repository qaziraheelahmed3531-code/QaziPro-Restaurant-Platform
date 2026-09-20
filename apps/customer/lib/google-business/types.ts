export type PublicGoogleReview = {
  reviewId: string
  reviewerName: string
  reviewerPhotoUrl?: string
  starRating: number
  comment: string
  createTime: string | null
  updateTime: string | null
}

type GoogleReviewsPublicContext = {
  businessName: string
  mapsUrl: string | null
  newReviewUrl: string | null
}

export type GoogleReviewsPayload = GoogleReviewsPublicContext & {
  ok: true
  available: true
  reviews: PublicGoogleReview[]
  averageRating: number | null
  totalReviewCount: number | null
  hasMore: boolean
}

export type GoogleReviewsUnavailablePayload = GoogleReviewsPublicContext & {
  ok: false
  available: false
  stage: "oauth" | "reviews"
  status: number
  code: string
  message: string
  quotaLimitValueZero?: boolean
  reviews: []
  averageRating: null
  totalReviewCount: null
  hasMore: false
}

export type GoogleReviewsApiPayload = GoogleReviewsPayload | GoogleReviewsUnavailablePayload

export type GoogleReviewApiRecord = {
  name?: unknown
  reviewId?: unknown
  reviewer?: { displayName?: unknown; profilePhotoUrl?: unknown }
  starRating?: unknown
  comment?: unknown
  createTime?: unknown
  updateTime?: unknown
}

export type GoogleReviewListResponse = {
  reviews?: GoogleReviewApiRecord[]
  averageRating?: unknown
  totalReviewCount?: unknown
  nextPageToken?: unknown
}

export type GoogleLocationResponse = {
  metadata?: { mapsUrl?: unknown; newReviewUrl?: unknown }
}
