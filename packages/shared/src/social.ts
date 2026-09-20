export const socialPlatforms = ["Facebook", "Instagram", "WhatsApp", "TikTok", "YouTube", "X"] as const
export type SocialPlatform = typeof socialPlatforms[number]

export function normalizeSocialUrl(platform: string, input: unknown): string {
  const raw = String(input ?? "").trim()
  if (!raw) return ""
  if (platform.toLowerCase() === "whatsapp") {
    let phone = raw
    if (/^https?:\/\//i.test(raw)) {
      const url = new URL(raw)
      if (url.hostname === "wa.me" || url.hostname === "www.wa.me") phone = url.pathname.slice(1)
      else if (url.hostname === "api.whatsapp.com") phone = url.searchParams.get("phone") ?? ""
      else throw new Error("Use an international WhatsApp number or a wa.me link.")
    }
    if (!/^[+\d ()-]+$/.test(phone)) throw new Error("Enter a valid international WhatsApp number.")
    const digits = phone.replace(/\D/g, "").replace(/^00/, "")
    if (!/^[1-9]\d{7,14}$/.test(digits)) throw new Error("Include the country code, for example 923XXXXXXXXX.")
    return `https://wa.me/${digits}`
  }
  let url: URL
  try { url = new URL(raw) } catch { throw new Error("Enter a complete https:// social link.") }
  if (!["https:", "http:"].includes(url.protocol) || !url.hostname.includes(".") || url.username || url.password) throw new Error("Enter a valid public social link.")
  return url.toString()
}

export function visibleSocialLinks<T extends { platform: string; url: string }>(links: T[]): T[] {
  return links.flatMap(link => {
    const platform = socialPlatforms.find(value => value.toLowerCase() === link.platform.trim().toLowerCase())
    if (!platform) return []
    try { const url = normalizeSocialUrl(platform, link.url); return url ? [{ ...link, platform, url }] : [] } catch { return [] }
  })
}
