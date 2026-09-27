export type BrowserPushSubscription = { endpoint: string; keys: { p256dh: string; auth: string } }

/** Defense in depth: never let an authenticated subscription turn the worker into an SSRF proxy. */
export function parseBrowserSubscription(value: unknown): BrowserPushSubscription | null {
  if (!value || typeof value !== "object") return null
  const row = value as Partial<BrowserPushSubscription>
  if (typeof row.endpoint !== "string" || row.endpoint.length > 2048 || !row.keys) return null
  try {
    const url = new URL(row.endpoint)
    const trusted = url.hostname === "fcm.googleapis.com" || url.hostname === "web.push.apple.com"
      || url.hostname.endsWith(".push.services.mozilla.com") || url.hostname.endsWith(".notify.windows.com")
    if (!trusted || url.protocol !== "https:" || url.username || url.password || url.port || url.hash) return null
    if (!/^[A-Za-z0-9_-]{87}$/.test(row.keys.p256dh) || !/^[A-Za-z0-9_-]{22}$/.test(row.keys.auth)) return null
    return { endpoint: url.href, keys: { p256dh: row.keys.p256dh, auth: row.keys.auth } }
  } catch { return null }
}

export function safeNotificationPath(value: unknown): string | null {
  if (typeof value !== "string" || value.length > 500 || !value.startsWith("/") || /[\\\r\n]/.test(value)) return null
  try {
    const url = new URL(value, "https://restaurant.invalid")
    if (url.origin !== "https://restaurant.invalid" || url.search || !/^\/(?:orders(?:\/[A-Za-z0-9-]+)?|pages\/[a-z0-9-]+)?$/.test(url.pathname)) return null
    return url.pathname + url.hash
  } catch { return null }
}
