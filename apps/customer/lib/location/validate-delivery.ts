import "server-only"

import { geometryMatch, validPoint } from "@italian-pizza/shared/location"
import { resolveDeliveryAddress } from "@/lib/location/resolve-address"
import type { Coordinates, StorefrontSnapshot } from "@/types"

export async function validateDeliveryPoint(point: Coordinates, storefront: StorefrontSnapshot, expectedAreaId?: string) {
  if (!validPoint(point)) throw new Error("Choose a valid delivery pin.")
  if (storefront.source !== "database" || !storefront.branch.deliveryEnabled) throw new Error("Delivery is unavailable for this branch.")
  const geometry = geometryMatch(point, storefront.deliveryAreas)
  const detectedId = geometry?.id ?? (await resolveDeliveryAddress(point.latitude, point.longitude, storefront.deliveryAreas)).matchedAreaId
  const area = storefront.deliveryAreas.find((item) => item.id === detectedId)
  if (!area) throw new Error("This location is outside our delivery area.")
  if (expectedAreaId && expectedAreaId !== area.id && expectedAreaId !== area.databaseId) throw new Error(`This location is in ${area.label}. Update your delivery area before continuing.`)
  return area
}

export function validateRouteDistance(distanceKm: number, storefront: StorefrontSnapshot) {
  if (!Number.isFinite(distanceKm) || distanceKm < 0) throw new Error("Delivery distance could not be verified.")
  if (storefront.branch.maximumDistanceKm != null && distanceKm > storefront.branch.maximumDistanceKm) throw new Error("This address is beyond our delivery distance.")
}
