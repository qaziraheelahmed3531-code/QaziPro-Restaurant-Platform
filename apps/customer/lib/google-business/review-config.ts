import "server-only"

export const temporaryGoogleReviewsConfig = {
  businessName: "AMS ISLAMIC EDUCATION SYSTEM",
  mapsUrl: "https://www.google.com/maps/place/AMS+ISLAMIC+EDUCATION+SYSTEM/@33.601577,72.981675,15z/data=!4m15!1m8!3m7!1s0x38df970020a807fb:0xcbf718240f01741a!2sVictoria+Marquee!8m2!3d33.6018586!4d72.981712!10e5!16s%2Fg%2F11y28bs7l4!3m5!1s0x38df97930dbc8ff7:0xa6ae5b02b07e0499!8m2!3d33.601365!4d72.9816284!16s%2Fg%2F11pdw951sm",
} as const

export function getConfiguredGoogleBusinessReviewUrl() {
  const value = process.env.GOOGLE_BUSINESS_REVIEW_URL?.trim()
  if (!value) return null
  try {
    const url = new URL(value)
    const hostname = url.hostname.toLowerCase()
    const isGoogleUrl = hostname === "google.com"
      || hostname.endsWith(".google.com")
      || hostname === "g.page"
      || hostname === "goo.gl"
      || hostname.endsWith(".goo.gl")
    return url.protocol === "https:" && isGoogleUrl ? url.toString() : null
  } catch {
    return null
  }
}
