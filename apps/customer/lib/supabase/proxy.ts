import { createServerClient } from "@supabase/ssr"
import { type NextRequest, NextResponse } from "next/server"

export async function updateSession(request: NextRequest) {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL
  const publishableKey = process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY

  if (!url || !publishableKey) return NextResponse.next({ request })

  let response = NextResponse.next({ request })

  const supabase = createServerClient(url, publishableKey, {
    cookieOptions: { name: "italian-pizza-customer-auth", path: "/", sameSite: "lax" },
    cookies: {
      getAll() {
        return request.cookies.getAll()
      },
      setAll(cookiesToSet, headers) {
        cookiesToSet.forEach(({ name, value }) =>
          request.cookies.set(name, value),
        )
        response = NextResponse.next({ request, headers })
        cookiesToSet.forEach(({ name, value, options }) =>
          response.cookies.set(name, value, options),
        )
      },
    },
  })

  // getClaims validates and refreshes the token when needed. Keep this call
  // adjacent to client creation so no accidental early return skips refresh.
  await supabase.auth.getClaims()

  return response
}
