import "server-only"

import { createServerClient } from "@supabase/ssr"
import { cookies } from "next/headers"

const cookieOptions = {
  name: "qazipro-client-auth",
  path: "/",
  sameSite: "lax" as const,
  secure: process.env.NODE_ENV === "production",
  httpOnly: true,
}

export function portalAuthConfigured() {
  return Boolean(
    (process.env.NEXT_PUBLIC_SUPABASE_URL || process.env.SUPABASE_URL) &&
    process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY,
  )
}

export async function createPortalAuthClient(responseHeaders?: Headers) {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL || process.env.SUPABASE_URL
  const key = process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY
  if (!url || !key) throw new Error("Client Portal authentication is not configured.")
  const cookieStore = await cookies()
  return createServerClient(url, key, {
    cookieOptions,
    cookies: {
      getAll: () => cookieStore.getAll(),
      setAll(cookiesToSet, headers) {
        try {
          cookiesToSet.forEach(({ name, value, options }) =>
            cookieStore.set(name, value, { ...options, httpOnly: true }),
          )
          Object.entries(headers).forEach(([name, value]) => responseHeaders?.set(name, value))
        } catch {
          // Proxy owns refresh writes when a Server Component is read-only.
        }
      },
    },
  })
}
