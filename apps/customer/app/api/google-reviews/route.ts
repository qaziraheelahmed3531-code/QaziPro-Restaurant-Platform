import { NextResponse } from "next/server"
import { getStorefrontSnapshot } from "@/lib/storefront/server"
import { getCachedRestaurantGooglePlacesReviews } from "@/lib/google-places/cache"

export async function GET() {
  const storefront = await getStorefrontSnapshot()
  const { business, branch } = storefront
  const headers = { "Cache-Control": "private, no-store" }
  const unavailable = (code: string, status = 200) => NextResponse.json({
    ok: false, available: false, source: "google-places-new", stage: "parsing", status,
    code, message: "Google reviews are currently unavailable for this restaurant.",
    businessName: storefront.orderPersistence === "database" ? business.name : "Restaurant",
    reviews: [], rating: null, totalReviewCount: null,
    googleMapsLinks: { placeUri: null, reviewsUri: null, writeAReviewUri: null },
  }, { status, headers })
  if (storefront.orderPersistence !== "database" || !business.id || !branch.id) return unavailable("RESTAURANT_UNAVAILABLE", 404)
  if (!business.reviewsEnabled || !branch.googlePlaceId || branch.originLatitude == null || branch.originLongitude == null) return unavailable("NOT_CONFIGURED")
  try {
    const payload = await getCachedRestaurantGooglePlacesReviews({
      businessId: business.id, branchId: branch.id, placeId: branch.googlePlaceId,
      businessName: business.reviewsBusinessName || business.name,
      latitude: branch.originLatitude, longitude: branch.originLongitude,
    })
    return NextResponse.json(payload, { headers })
  } catch {
    // No provider details or another restaurant's cached fallback in public errors.
    return unavailable("REVIEWS_UNAVAILABLE")
  }
}
