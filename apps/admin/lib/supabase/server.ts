import "server-only"

import { createServerClient } from "@supabase/ssr"
import { cookies } from "next/headers"

export function isSupabaseConfigured() {
  return Boolean(process.env.NEXT_PUBLIC_SUPABASE_URL && process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY)
}

export async function createClient(responseHeaders?: Headers) {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL
  const key = process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY
  if (!url || !key) throw new Error("Supabase public configuration is missing.")
  const cookieStore = await cookies()
  return createServerClient(url, key, {
    cookieOptions: { name: "italian-pizza-admin-auth", path: "/", sameSite: "lax" },
    cookies: {
      getAll: () => cookieStore.getAll(),
      setAll(cookiesToSet, headers) {
        try {
          cookiesToSet.forEach(({ name, value, options }) => cookieStore.set(name, value, options))
          Object.entries(headers).forEach(([name, value]) => responseHeaders?.set(name, value))
        } catch {
          // Session refresh is applied by proxy when Server Components cannot write.
        }
      },
    },
  })
}
