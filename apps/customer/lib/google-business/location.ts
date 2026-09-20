import "server-only"

import { getGoogleBusinessConfig, googleBusinessFetch } from "@/lib/google-business/auth"
import type { GoogleLocationResponse } from "@/lib/google-business/types"

export async function resolveGoogleBusinessLocationId() {
  return getGoogleBusinessConfig().locationId
}

function publicUrl(value: unknown) {
  if (typeof value !== "string") return null
  try {
    const url = new URL(value)
    return url.protocol === "https:" && (url.hostname === "google.com" || url.hostname.endsWith(".google.com") || url.hostname === "goo.gl") ? url.toString() : null
  } catch {
    return null
  }
}

export async function getGoogleLocationLinks() {
  const { accountId } = getGoogleBusinessConfig()
  const locationId = await resolveGoogleBusinessLocationId()
  const resource = `accounts/${encodeURIComponent(accountId)}/locations/${encodeURIComponent(locationId)}`
  const data = await googleBusinessFetch<GoogleLocationResponse>(
    `https://mybusiness.googleapis.com/v4/${resource}?fields=metadata`,
    "location",
  )
  return {
    mapsUrl: publicUrl(data.metadata?.mapsUrl),
    newReviewUrl: publicUrl(data.metadata?.newReviewUrl),
  }
}
