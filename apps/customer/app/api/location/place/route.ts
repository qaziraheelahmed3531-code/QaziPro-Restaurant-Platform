import { NextRequest, NextResponse } from "next/server"

import { googlePlaceDetails } from "@/lib/google-places"

export async function GET(request: NextRequest) {
  const placeId = request.nextUrl.searchParams.get("placeId")?.trim() ?? ""
  if (!placeId || placeId.length > 300) return NextResponse.json({ error: "A valid place is required." }, { status: 400 })
  try { return NextResponse.json(await googlePlaceDetails(placeId), { headers: { "Cache-Control": "private, no-store" } }) }
  catch { return NextResponse.json({ error: "This place could not be resolved. Please choose another suggestion." }, { status: 502 }) }
}
