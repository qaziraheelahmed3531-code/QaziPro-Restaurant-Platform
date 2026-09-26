// Public platform identity contract. Never contains restaurant-specific branding.
export type PlatformBranding = { logo: string; icon: string; version: number; updatedAt: string | null; available: boolean }
export const defaultBranding: PlatformBranding = { logo: "/qazipro-logo.png", icon: "/qazipro-logo.png", version: 1, updatedAt: null, available: false }
export const brandingAssetPath = (value: unknown): value is string => typeof value === "string" && /^platform\/[0-9a-f-]{36}\.png$/.test(value)
export function brandingAssetUrl(path: unknown, supabaseUrl: string): string | null {
  if (!brandingAssetPath(path)) return null
  try { const origin = new URL(supabaseUrl); if (origin.protocol !== "https:") return null; return `${origin.origin}/storage/v1/object/public/platform-branding/${path}` } catch { return null }
}
