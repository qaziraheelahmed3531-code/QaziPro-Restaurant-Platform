import { NextRequest, NextResponse } from "next/server"

import { autocompleteAddress } from "@/lib/geoapify/autocomplete"
import { GeoapifyServiceError } from "@/lib/geoapify/client"
import { getStorefrontSnapshot } from "@/lib/storefront/server"

export async function GET(request: NextRequest) {
  const query = request.nextUrl.searchParams.get("q")?.trim() ?? ""
  if (query.length < 3 || query.length > 160) {
    return NextResponse.json({ error: "Enter between 3 and 160 characters." }, { status: 400 })
  }

  try {
    const storefront = await getStorefrontSnapshot()
    const area = storefront.deliveryAreas.find(item => item.id === request.nextUrl.searchParams.get("areaId"))
    const origin = area?.centerLatitude != null && area.centerLongitude != null ? { latitude: area.centerLatitude, longitude: area.centerLongitude } : storefront.branch.originLatitude !== null && storefront.branch.originLongitude !== null ? { latitude: storefront.branch.originLatitude, longitude: storefront.branch.originLongitude } : undefined
    const city = storefront.branch.city || storefront.business.city
    const suggestions = await autocompleteAddress(query, area ? `${area.label}, ${city}` : city, origin)
    return NextResponse.json({ suggestions }, {
      headers: { "Cache-Control": "private, no-store" },
    })
  } catch (error) {
    const unavailable = error instanceof GeoapifyServiceError && error.code === "not-configured"
    return NextResponse.json(
      { error: "Address suggestions are temporarily unavailable." },
      { status: unavailable ? 503 : 502 },
    )
  }
}
