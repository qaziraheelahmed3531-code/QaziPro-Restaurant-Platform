import { NextRequest, NextResponse } from "next/server"

import { validateDeliveryPoint, validateRouteDistance } from "@/lib/location/validate-delivery"
import { calculateDeliveryFee } from "@/lib/delivery-fee"
import { GeoapifyServiceError, isCoordinate } from "@/lib/geoapify/client"
import { getDrivingRoute } from "@/lib/geoapify/routing"
import { getStorefrontSnapshot } from "@/lib/storefront/server"

export async function GET(request: NextRequest) {
  const latitude = Number(request.nextUrl.searchParams.get("latitude"))
  const longitude = Number(request.nextUrl.searchParams.get("longitude"))
  if (!request.nextUrl.searchParams.get("latitude") || !request.nextUrl.searchParams.get("longitude") || !isCoordinate(latitude, -90, 90) || !isCoordinate(longitude, -180, 180)) {
    return NextResponse.json({ error: "Valid latitude and longitude are required." }, { status: 400 })
  }

  try {
    const storefront = await getStorefrontSnapshot()
    try { await validateDeliveryPoint({ latitude, longitude }, storefront, request.nextUrl.searchParams.get("areaId") ?? undefined) } catch (error) { return NextResponse.json({ error: error instanceof Error ? error.message : "Delivery could not be verified." }, { status: 422 }) }
    const configuredOrigin = storefront.branch.originLatitude !== null && storefront.branch.originLongitude !== null
      ? { latitude: storefront.branch.originLatitude, longitude: storefront.branch.originLongitude }
      : undefined
    if (!configuredOrigin) return NextResponse.json({ error: "Delivery location is being configured. Please try again shortly." }, { status: 503 })
    const route = await getDrivingRoute(latitude, longitude, configuredOrigin)
    if(process.env.NODE_ENV==="development") console.info("[delivery-route] authoritative branch quote",{branchId:storefront.branch.id,branchName:storefront.branch.name,origin:configuredOrigin,destination:{latitude,longitude},distanceKm:route.distanceKm,durationMinutes:route.estimatedDurationMinutes})
    if (route.distanceKm > 50 && process.env.NODE_ENV === "development") console.warn("[delivery-route] selected branch produced a long local route", { branchId: storefront.branch.id, branchName: storefront.branch.name, distanceKm: route.distanceKm })
    try { validateRouteDistance(route.distanceKm, storefront) } catch { return NextResponse.json({ error: "This address is beyond our delivery distance." }, { status: 422 }) }
    const deliveryFee = calculateDeliveryFee(route.distanceKm, storefront.branch.freeDistanceKm, storefront.branch.extraKmRate)
    if (deliveryFee === null) throw new GeoapifyServiceError("Route distance was invalid.", "invalid-response")
    return NextResponse.json({ ...route, deliveryFee }, {
      headers: { "Cache-Control": "private, no-store" },
    })
  } catch (error) {
    const unavailable = error instanceof GeoapifyServiceError && error.code === "not-configured"
    return NextResponse.json(
      { error: unavailable ? "Delivery routing is not configured." : "A driving route could not be calculated." },
      { status: unavailable ? 503 : 502 },
    )
  }
}
