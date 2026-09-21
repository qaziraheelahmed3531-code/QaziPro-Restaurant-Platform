"use client"

import { createBrowserClient } from "@supabase/ssr"
import type { SupabaseClient } from "@supabase/supabase-js"

let client: SupabaseClient | undefined

export function createClient() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL
  const key = process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY
  if (!url || !key) throw new Error("Supabase public configuration is missing.")
  client ??= createBrowserClient(url, key, {
    cookieOptions: { name: "qazipro-platform-auth", path: "/", sameSite: "lax", secure: process.env.NODE_ENV === "production" },
  })
  return client
}
