"use client"

import { createBrowserClient } from "@supabase/ssr"
import type { SupabaseClient } from "@supabase/supabase-js"

let browserClient: SupabaseClient | undefined

function publicConfig() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL
  const publishableKey = process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY

  if (!url || !publishableKey) {
    throw new Error("Supabase public environment variables are not configured.")
  }

  return { url, publishableKey }
}

export function isSupabaseConfigured() {
  return Boolean(
    process.env.NEXT_PUBLIC_SUPABASE_URL &&
      process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY,
  )
}

export function createClient() {
  if (browserClient) return browserClient

  const { url, publishableKey } = publicConfig()
  browserClient = createBrowserClient(url, publishableKey, {
    // Customer and Admin run on the same hostname.  Keep their SSR cookies
    // separate while using the exact same name in browser/server clients.
    cookieOptions: { name: "italian-pizza-customer-auth", path: "/", sameSite: "lax" },
  })
  return browserClient
}
