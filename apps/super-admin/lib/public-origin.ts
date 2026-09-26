const CANONICAL_SUPER_ADMIN_ORIGIN = "https://superadmin.qazipro.com"
const LOCAL_SUPER_ADMIN_ORIGIN = "http://localhost:3002"

type PlatformEnvironment = Partial<Record<
  "APP_ENVIRONMENT" | "NEXT_PUBLIC_APP_ENVIRONMENT" | "NODE_ENV" | "PLATFORM_PUBLIC_URL",
  string | undefined
>>

function normalizedOrigin(value: string | undefined) {
  if (!value) return null
  try {
    const url = new URL(value)
    if (!["http:", "https:"].includes(url.protocol)) return null
    return url.origin
  } catch {
    return null
  }
}

export function getPlatformPublicOrigin(environment: PlatformEnvironment = process.env) {
  const appEnvironment = (environment.APP_ENVIRONMENT ?? environment.NEXT_PUBLIC_APP_ENVIRONMENT ?? "").toLowerCase()
  const isLocal = appEnvironment === "local" && environment.NODE_ENV !== "production"
  if (!isLocal) return CANONICAL_SUPER_ADMIN_ORIGIN

  return normalizedOrigin(environment.PLATFORM_PUBLIC_URL) ?? LOCAL_SUPER_ADMIN_ORIGIN
}

export function getPlatformAuthCallbackUrl(environment: PlatformEnvironment = process.env) {
  return `${getPlatformPublicOrigin(environment)}/auth/callback`
}

