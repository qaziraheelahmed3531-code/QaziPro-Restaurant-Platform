import { type NextRequest, NextResponse } from "next/server"

import { updateSession } from "@/lib/supabase/proxy"

const apiCorsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "GET, POST, PATCH, DELETE, OPTIONS",
  "Access-Control-Allow-Headers":
    "Authorization, Content-Type, X-QaziPro-Restaurant, X-QaziPro-Branch-Id, X-Order-Token, X-Request-Id, Idempotency-Key",
  "Access-Control-Expose-Headers": "X-Request-Id",
  "Access-Control-Max-Age": "86400",
}

export async function proxy(request: NextRequest) {
  const mobileApi = request.nextUrl.pathname.startsWith("/api/v1/")
  if (mobileApi && request.method === "OPTIONS")
    return new NextResponse(null, { status: 204, headers: apiCorsHeaders })

  const response = await updateSession(request)
  if (mobileApi)
    Object.entries(apiCorsHeaders).forEach(([name, value]) =>
      response.headers.set(name, value),
    )
  return response
}

export const config = {
  matcher: [
    "/((?!_next/static|_next/image|favicon.ico|.*\\.(?:svg|png|jpg|jpeg|gif|webp)$).*)",
  ],
}
