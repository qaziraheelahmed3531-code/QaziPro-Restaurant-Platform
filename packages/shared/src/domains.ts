const hostnamePattern = /^(?=.{1,253}$)(?:[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?\.)+[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?$/

export const reservedRestaurantSlugs = new Set([
  "admin", "api", "app", "apps", "auth", "dashboard", "dev", "email",
  "help", "kitchen", "mail", "pos", "rider", "staging", "status",
  "super-admin", "superadmin", "support", "test", "waiter", "www",
])

export function normalizeHostname(value: string | null | undefined) {
  const first = (value ?? "").split(",", 1)[0].trim().toLowerCase()
  if (!first) return ""
  let candidate = first
  try {
    if (/^[a-z][a-z0-9+.-]*:\/\//i.test(first)) candidate = new URL(first).hostname
  } catch {
    return ""
  }
  candidate = candidate.replace(/:\d+$/, "").replace(/\.+$/, "")
  if (candidate.includes("/") || candidate.includes("?") || candidate.includes("#")) return ""
  if (["localhost", "127.0.0.1", "::1"].includes(candidate)) return candidate
  return hostnamePattern.test(candidate) ? candidate : ""
}

export function normalizeRestaurantSlug(value: string | null | undefined) {
  const slug = (value ?? "")
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 63)
  return slug && !reservedRestaurantSlugs.has(slug) ? slug : ""
}

export function stagingHostnameForSlug(slugValue: string, platformDomain: string) {
  const slug = normalizeRestaurantSlug(slugValue)
  const domain = normalizeHostname(platformDomain)
  if (!slug || !domain) return ""
  return `${slug}.${domain}`
}

export function isHostnameWithinPlatformDomain(hostnameValue: string, platformDomainValue: string) {
  const hostname = normalizeHostname(hostnameValue)
  const platformDomain = normalizeHostname(platformDomainValue)
  return Boolean(hostname && platformDomain && hostname !== platformDomain && hostname.endsWith(`.${platformDomain}`))
}

export function requestHostname(input: {
  host?: string | null
  forwardedHost?: string | null
  platformDomain?: string | null
}) {
  const host = normalizeHostname(input.host)
  const forwardedHost = normalizeHostname(input.forwardedHost)
  if (!host) return forwardedHost
  if (!forwardedHost || forwardedHost === host) return host
  const hostIsVercelDeployment = host.endsWith(".vercel.app")
  if (hostIsVercelDeployment && isHostnameWithinPlatformDomain(forwardedHost, input.platformDomain ?? "")) {
    return forwardedHost
  }
  return host
}
