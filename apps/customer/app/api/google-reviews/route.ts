import { NextRequest, NextResponse } from "next/server"

import { clearGooglePlacesReviewsCacheForDevelopment, getCachedAmsGooglePlacesReviews } from "@/lib/google-places/cache"
import { GooglePlacesServiceError } from "@/lib/google-places/client"
import { amsGooglePlacesConfig } from "@/lib/google-places/config"
import type { GooglePlacesReviewsUnavailablePayload } from "@/lib/google-places/types"

const emptyLinks = { placeUri: null, reviewsUri: null, writeAReviewUri: null } as const

function developmentDiagnostic(details: {
  httpStatus: number
  googleErrorStatus: string | null
  googleErrorMessage: string
  stage: "places-search" | "place-details" | "legacy-place-details" | "parsing"
  rawReviewsFieldPresent?: boolean
  rawReviewsCount?: number
  normalizedReviewsCount?: number
  textSearchRawReviewsCount?: number
  legacyHttpStatus?: number | null
  legacyGoogleStatus?: string | null
  legacyReviewsFieldPresent?: boolean
  legacyRawReviewCount?: number
  legacyNormalizedReviewCount?: number
  placesWorking?: boolean
  sociableKitConfigured?: boolean
  sociableKitHttpStatus?: number | null
  sociableKitReviewCount?: number
  finalReviewCount?: number
  sociableKitErrorCode?: string | null
  sociableKitErrorMessage?: string | null
}) {
  if (process.env.NODE_ENV === "development") console.error(`[google-reviews] ${JSON.stringify(details)}`)
}

export async function GET(request: NextRequest) {
  if (request.nextUrl.searchParams.get("refresh") === "1") {
    clearGooglePlacesReviewsCacheForDevelopment()
  }
  try {
    const payload = await getCachedAmsGooglePlacesReviews()
    if (process.env.NODE_ENV === "development") {
      console.info(`[google-reviews] ${JSON.stringify({
        httpStatus: 200,
        googleErrorStatus: null,
        googleErrorMessage: "Google Places reviews loaded.",
        stage: "place-details",
        ...payload.diagnostics,
      })}`)
    }
    return NextResponse.json(payload, {
      headers: { "Cache-Control": "public, s-maxage=300, stale-while-revalidate=60" },
    })
  } catch (error) {
    const serviceError = error instanceof GooglePlacesServiceError ? error : null
    const stage = serviceError?.stage ?? "parsing"
    const status = serviceError?.httpStatus ?? 500
    const code = serviceError?.code ?? "INTERNAL_ERROR"
    const message = serviceError?.message ?? "Google Places reviews could not be loaded."
    developmentDiagnostic({
      httpStatus: status,
      googleErrorStatus: serviceError?.googleStatus ?? code,
      googleErrorMessage: message,
      stage,
    })
    const payload: GooglePlacesReviewsUnavailablePayload = {
      ok: false,
      available: false,
      source: "google-places-new",
      businessName: amsGooglePlacesConfig.businessName,
      stage,
      status,
      code,
      message,
      rating: null,
      totalReviewCount: null,
      reviews: [],
      googleMapsLinks: emptyLinks,
    }
    return NextResponse.json(payload, {
      status: 200,
      headers: { "Cache-Control": status === 503 ? "public, s-maxage=300" : "public, s-maxage=60" },
    })
  }
}
