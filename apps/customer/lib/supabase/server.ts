import "server-only"

import { createServerClient } from "@supabase/ssr"
import { cookies } from "next/headers"

export function isSupabaseConfigured() {
  return Boolean(
    process.env.NEXT_PUBLIC_SUPABASE_URL &&
      process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY,
  )
}

export async function createClient(responseHeaders?: Headers) {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL
  const publishableKey = process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY

  if (!url || !publishableKey) {
    throw new Error("Supabase public environment variables are not configured.")
  }

  const cookieStore = await cookies()

  return createServerClient(url, publishableKey, {
    cookieOptions: { name: "italian-pizza-customer-auth", path: "/", sameSite: "lax" },
    cookies: {
      getAll() {
        return cookieStore.getAll()
      },
      setAll(cookiesToSet, headers) {
        try {
          cookiesToSet.forEach(({ name, value, options }) =>
            cookieStore.set(name, value, options),
          )
          Object.entries(headers).forEach(([name, value]) => responseHeaders?.set(name, value))
        } catch {
          // Server Components cannot write cookies. The root proxy refreshes
          // sessions and applies cookie changes on the response instead.
        }
      },
    },
  })
}
