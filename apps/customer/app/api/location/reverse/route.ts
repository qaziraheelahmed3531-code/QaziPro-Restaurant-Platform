import { NextRequest, NextResponse } from "next/server"

import { GeoapifyServiceError, isCoordinate } from "@/lib/geoapify/client"
import { resolveDeliveryAddress } from "@/lib/location/resolve-address"
import { getStorefrontSnapshot } from "@/lib/storefront/server"

export async function GET(request: NextRequest) {
  const latitude = Number(request.nextUrl.searchParams.get("latitude"))
  const longitude = Number(request.nextUrl.searchParams.get("longitude"))
  if (!request.nextUrl.searchParams.get("latitude") || !request.nextUrl.searchParams.get("longitude") || !isCoordinate(latitude, -90, 90) || !isCoordinate(longitude, -180, 180)) {
    return NextResponse.json({ error: "Valid latitude and longitude are required." }, { status: 400 })
  }

  try {
    const storefront = await getStorefrontSnapshot()
    const result = await resolveDeliveryAddress(latitude, longitude, storefront.deliveryAreas)
    return NextResponse.json(result, {
      headers: { "Cache-Control": "private, no-store" },
    })
  } catch (error) {
    const unavailable = error instanceof GeoapifyServiceError && error.code === "not-configured"
    return NextResponse.json(
      { error: "We could not identify this location. Search an address or try another point." },
      { status: unavailable ? 503 : 502 },
    )
  }
}
