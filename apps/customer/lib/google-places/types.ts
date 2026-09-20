export type GooglePlacesStage = "places-search" | "place-details" | "legacy-place-details" | "parsing"

export type GoogleLocalizedText = {
  text?: unknown
  languageCode?: unknown
}

export type GooglePlaceLocation = {
  latitude?: unknown
  longitude?: unknown
}

export type GoogleMapsLinks = {
  placeUri: string | null
  reviewsUri: string | null
  writeAReviewUri: string | null
}

export type GooglePlacesReviewRecord = {
  name?: unknown
  authorAttribution?: {
    displayName?: unknown
    uri?: unknown
    photoUri?: unknown
  }
  rating?: unknown
  text?: GoogleLocalizedText
  originalText?: GoogleLocalizedText
  relativePublishTimeDescription?: unknown
  publishTime?: unknown
  googleMapsUri?: unknown
}

export type GooglePlacesSearchPlace = {
  id?: unknown
  displayName?: GoogleLocalizedText
  formattedAddress?: unknown
  location?: GooglePlaceLocation
  rating?: unknown
  userRatingCount?: unknown
  reviews?: GooglePlacesReviewRecord[]
  googleMapsLinks?: {
    placeUri?: unknown
    reviewsUri?: unknown
    writeAReviewUri?: unknown
  }
}

export type GooglePlacesSearchResponse = {
  places?: GooglePlacesSearchPlace[]
}

export type GooglePlaceDetailsResponse = GooglePlacesSearchPlace

export type GooglePlacesReviewDiagnostics = {
  rawReviewsFieldPresent: boolean
  rawReviewsCount: number
  normalizedReviewsCount: number
  textSearchRawReviewsCount: number
  legacyHttpStatus: number | null
  legacyGoogleStatus: string | null
  legacyReviewsFieldPresent: boolean
  legacyRawReviewCount: number
  legacyNormalizedReviewCount: number
  placesWorking: boolean
  sociableKitConfigured: boolean
  sociableKitHttpStatus: number | null
  sociableKitReviewCount: number
  finalReviewCount: number
  sociableKitErrorCode: string | null
  sociableKitErrorMessage: string | null
}

export type PublicGoogleReview = {
  id: string | null
  reviewerName: string
  reviewerPhotoUrl: string | null
  reviewerProfileUrl: string | null
  rating: number | null
  text: string | null
  relativeTime: string | null
  publishTime: string | null
  googleMapsUri: string | null
  source: "google"
}

type GooglePlacesPublicContext = {
  source: "google-places-new" | "google-places-legacy-fallback" | "google-places+sociablekit"
  businessName: string
  reviews: PublicGoogleReview[]
  rating: number | null
  totalReviewCount: number | null
  googleMapsLinks: GoogleMapsLinks
}

export type GooglePlacesReviewsPayload = GooglePlacesPublicContext & {
  ok: true
  available: true
  textSearchUsed: boolean
  diagnostics?: GooglePlacesReviewDiagnostics
}

export type GooglePlacesReviewsUnavailablePayload = GooglePlacesPublicContext & {
  ok: false
  available: false
  stage: GooglePlacesStage
  status: number
  code: string
  message: string
}

export type GooglePlacesReviewsApiPayload = GooglePlacesReviewsPayload | GooglePlacesReviewsUnavailablePayload
