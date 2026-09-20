import { validPoint } from "./location"

export type GeoapifyPlace = {
  id: string; name: string; formattedAddress: string; lat: number; lon: number
  city: string; district: string; suburb: string; state: string; country: string; countryCode: string; type: string
  provider: "geoapify"; providerPlaceId: string | null; latitude: number; longitude: number
  slug: string; region: string; countryName: string; postalCode: string
  label: string; description: string; coordinates: { latitude: number; longitude: number }
  aliases: string[]; isBusiness: boolean
}
export function normalizeGeoapifyPlace(row: Record<string, unknown>): GeoapifyPlace | null {
  const str = (key: string) => typeof row[key] === "string" ? (row[key] as string).trim() : ""
  if (typeof row.lat !== "number" || typeof row.lon !== "number" || !validPoint({latitude:row.lat,longitude:row.lon})) return null
  const international = row.name_international && typeof row.name_international === "object" ? row.name_international as Record<string, unknown> : {}
  const englishName = typeof international.en === "string" ? international.en.trim() : ""
  const categories = Array.isArray(row.categories) ? row.categories.map(String) : []
  const name = englishName || str("suburb") || str("neighbourhood") || str("district") || str("name") || str("address_line1") || str("formatted")
  if (!name) return null
  const formattedAddress = str("formatted") || [name,str("address_line2")].filter(Boolean).join(", ")
  return { id:str("place_id") || `${row.lat}:${row.lon}:${name}`, name,formattedAddress,lat:row.lat,lon:row.lon,
    city:str("city")||str("municipality")||str("town")||str("district")||str("locality")||str("county")||str("village"),district:str("district")||str("county"),suburb:str("suburb")||str("neighbourhood")||str("quarter"),state:str("state"),country:str("country"),countryCode:str("country_code"),type:str("result_type")||categories.find(value=>value.startsWith("populated_place."))?.split(".").at(-1)||"locality",
    provider:"geoapify",providerPlaceId:str("place_id")||null,latitude:row.lat,longitude:row.lon,
    slug:name.toLowerCase().replace(/[^\p{L}\p{N}]+/gu,"-").replace(/^-+|-+$/g,""),region:str("state"),countryName:str("country"),postalCode:str("postcode"),
    label:name,description:str("address_line2")||formattedAddress,coordinates:{latitude:row.lat,longitude:row.lon},
    aliases:[str("name"),str("suburb"),str("neighbourhood"),str("district")].filter(value=>Boolean(value)&&value!==name),
    isBusiness:str("result_type")==="amenity"||categories.some(value=>!value.startsWith("populated_place")),
  }
}
