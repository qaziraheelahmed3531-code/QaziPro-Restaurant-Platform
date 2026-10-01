import { createServerClient } from "@supabase/ssr"
import { type NextRequest, NextResponse } from "next/server"

export async function updatePortalSession(request: NextRequest) {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL || process.env.SUPABASE_URL
  const key = process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY
  let response = NextResponse.next({ request })
  if (!url || !key) return response

  const supabase = createServerClient(url, key, {
    cookieOptions: {
      name: "qazipro-client-auth",
      path: "/",
      sameSite: "lax",
      secure: process.env.NODE_ENV === "production",
      httpOnly: true,
    },
    cookies: {
      getAll: () => request.cookies.getAll(),
      setAll(cookiesToSet, headers) {
        cookiesToSet.forEach(({ name, value }) => request.cookies.set(name, value))
        response = NextResponse.next({ request, headers })
        cookiesToSet.forEach(({ name, value, options }) =>
          response.cookies.set(name, value, { ...options, httpOnly: true }),
        )
      },
    },
  })
  await supabase.auth.getClaims()
  response.headers.set("X-Frame-Options", "DENY")
  response.headers.set("X-Content-Type-Options", "nosniff")
  response.headers.set("Referrer-Policy", "strict-origin-when-cross-origin")
  return response
}
