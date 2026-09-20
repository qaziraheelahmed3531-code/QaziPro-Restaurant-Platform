import "server-only"

export const amsGooglePlacesConfig = {
  businessName: "AMS ISLAMIC EDUCATION SYSTEM",
  latitude: 33.601365,
  longitude: 72.9816284,
  searchRadiusMeters: 1_500,
} as const

export function getGooglePlacesConfiguration() {
  return {
    apiKey: process.env.GOOGLE_PLACES_API_KEY?.trim() ?? "",
    placeId: process.env.GOOGLE_PLACES_PLACE_ID?.trim() || null,
  }
}
