export type SociableKitFeedReview = {
  id?: unknown
  reviewer_name?: unknown
  reviewer_photo_url?: unknown
  reviewer_photo?: unknown
  profile_photo_url?: unknown
  review_date_time?: unknown
  rating?: unknown
  review_text?: unknown
}

export type SociableKitFeedPayload = {
  bio?: { name?: unknown }
  reviews?: SociableKitFeedReview[]
  last_sync_info?: unknown
}

export type SociableKitReview = {
  id: string | null
  reviewerName: string
  reviewerPhotoUrl: string | null
  rating: number | null
  text: string | null
  reviewDate: string | null
  source: "google"
}

export type SociableKitReviewsResult = {
  configured: boolean
  httpStatus: number | null
  reviews: SociableKitReview[]
  lastSyncInfo: string | null
  errorCode: string | null
  errorMessage: string | null
}
