export type DeliveryRule = {
  freeDistanceKm: number
  extraKmRate: number
  roundingMode: "CEIL"
}

export function calculateDeliveryFee(distanceKm: number, rule: DeliveryRule) {
  if (!Number.isFinite(distanceKm) || distanceKm < 0) return null
  if (!Number.isFinite(rule.freeDistanceKm) || rule.freeDistanceKm < 0) return null
  if (!Number.isInteger(rule.extraKmRate) || rule.extraKmRate < 0) return null
  if (distanceKm <= rule.freeDistanceKm) return 0
  return Math.ceil(distanceKm - rule.freeDistanceKm) * rule.extraKmRate
}

export function isUuid(value: unknown): value is string {
  return typeof value === "string" && /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(value)
}

export function asMoney(value: unknown) {
  const amount = typeof value === "number" ? value : Number(value)
  return Number.isInteger(amount) && amount >= 0 && amount <= 100_000_000 ? amount : null
}

export function asQuantity(value: unknown) {
  const quantity = typeof value === "number" ? value : Number(value)
  return Number.isInteger(quantity) && quantity >= 1 && quantity <= 50 ? quantity : null
}

export function normalizeText(value: unknown, maximumLength: number) {
  if (typeof value !== "string") return ""
  return value.trim().replace(/\s+/g, " ").slice(0, maximumLength)
}
