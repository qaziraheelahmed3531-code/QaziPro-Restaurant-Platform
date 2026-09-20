import "server-only"

import { asNumber, GeoapifyServiceError, getGeoapifyJson } from "@/lib/geoapify/client"
import type { GeoapifyRoutingResponse, RouteResult } from "@/lib/geoapify/types"

export async function getDrivingRoute(latitude: number, longitude: number, restaurant: { latitude: number; longitude: number }): Promise<RouteResult> {
  const data = await getGeoapifyJson<GeoapifyRoutingResponse>("/v1/routing", {
    waypoints: `${restaurant.latitude},${restaurant.longitude}|${latitude},${longitude}`,
    mode: "drive",
    format: "json",
    units: "metric",
  })
  const result = data.results?.[0]
  const distanceMeters = asNumber(result?.distance)
  const durationSeconds = asNumber(result?.time)
  if (distanceMeters === null || durationSeconds === null) {
    throw new GeoapifyServiceError("No driving route was found.", "invalid-response")
  }
  const distanceKm = Math.round((distanceMeters / 1000) * 10) / 10
  if (distanceKm > 50 && process.env.NODE_ENV === "development") {
    console.warn("[delivery-route] unusually long route; verify branch origin", { origin: restaurant, destination: { latitude, longitude }, provider: { distanceMeters, durationSeconds }, distanceKm })
  }
  return {
    distanceKm,
    estimatedDurationMinutes: Math.max(1, Math.ceil(durationSeconds / 60)),
  }
}
