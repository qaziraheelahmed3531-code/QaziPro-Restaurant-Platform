export const FREE_DELIVERY_KM = 5
export const EXTRA_KM_RATE = 100

export function calculateDeliveryFee(distanceKm: number, freeDistanceKm = FREE_DELIVERY_KM, extraKmRate = EXTRA_KM_RATE) {
  return calculateSharedDeliveryFee(distanceKm, { freeDistanceKm, extraKmRate, roundingMode: "CEIL" })
}
import { calculateDeliveryFee as calculateSharedDeliveryFee } from "@italian-pizza/shared/commerce"
