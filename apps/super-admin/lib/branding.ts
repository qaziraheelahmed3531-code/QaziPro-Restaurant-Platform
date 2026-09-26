import "server-only"
import { cache } from "react"
import { createClient } from "@/lib/supabase/server"
import { brandingAssetUrl, defaultBranding, type PlatformBranding } from "./branding-contract"

// Request-local only: no cross-session cached authorization or stale branding.
export const getPlatformBranding = cache(async (): Promise<PlatformBranding> => {
  try {
    const client = await createClient()
    const { data, error } = await client.from("platform_branding").select("logo_path,icon_path,version,updated_at").eq("singleton", true).single()
    if (error || !data) return defaultBranding
    const logo = brandingAssetUrl(data.logo_path, process.env.NEXT_PUBLIC_SUPABASE_URL ?? "") ?? defaultBranding.logo
    return { logo, icon: brandingAssetUrl(data.icon_path, process.env.NEXT_PUBLIC_SUPABASE_URL ?? "") ?? logo, version: data.version, updatedAt: data.updated_at, available: true }
  } catch { return defaultBranding }
})
