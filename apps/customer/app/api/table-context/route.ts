import { NextRequest, NextResponse } from "next/server"
import { getStorefrontSnapshot } from "@/lib/storefront/server"

export async function POST(request: NextRequest) {
  // An explicit same-origin user action is required to leave a table session.
  if (request.headers.get("origin") !== request.nextUrl.origin) return new Response(null, { status: 403 })
  const storefront = await getStorefrontSnapshot({ tableToken: null })
  const response = NextResponse.redirect(new URL("/", request.url), 303)
  if (storefront.business.id) response.cookies.delete(`qp-table-${storefront.business.id}`)
  response.headers.set("Cache-Control", "private, no-store")
  return response
}
