import "server-only"
import { reverseGeocode } from "@/lib/geoapify/reverse-geocode"
import type { LocationArea } from "@/types"
// Quote, checkout and order validation use the same Geoapify coverage decision.
export function resolveDeliveryAddress(latitude:number,longitude:number,areas:LocationArea[]) {
  return reverseGeocode(latitude,longitude,areas)
}
