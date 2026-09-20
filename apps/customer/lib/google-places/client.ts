import "server-only"

import { getGooglePlacesConfiguration } from "@/lib/google-places/config"
import type { GooglePlacesStage } from "@/lib/google-places/types"

type UnknownRecord = Record<string, unknown>

function recordValue(value: unknown): UnknownRecord | null {
  return typeof value === "object" && value !== null ? value as UnknownRecord : null
}

function stringValue(value: unknown) {
  return typeof value === "string" && value.trim() ? value.trim() : null
}

function safeGoogleMessage(value: unknown, fallback: string) {
  const raw = stringValue(value)
  if (!raw) return fallback
  const apiKey = getGooglePlacesConfiguration().apiKey
  const redacted = apiKey ? raw.split(apiKey).join("[redacted]") : raw
  return redacted
    .replace(/https?:\/\/\S+/gi, "Google Cloud Console")
    .replace(/projects?\/[0-9]+/gi, "the configured project")
    .replace(/project\s+[0-9]+/gi, "the configured project")
    .replace(/\s+/g, " ")
    .trim()
    .slice(0, 400)
}

export class GooglePlacesServiceError extends Error {
  constructor(
    message: string,
    public readonly code: string,
    public readonly stage: GooglePlacesStage,
    public readonly httpStatus: number,
    public readonly googleStatus: string | null = null,
  ) {
    super(message)
    this.name = "GooglePlacesServiceError"
  }
}

function requireApiKey(stage: "places-search" | "place-details") {
  const apiKey = getGooglePlacesConfiguration().apiKey
  if (!apiKey) {
    throw new GooglePlacesServiceError(
      "Google Places API key is not configured.",
      "NOT_CONFIGURED",
      stage,
      503,
    )
  }
  return apiKey
}

function errorDetails(payload: unknown, status: number, stage: GooglePlacesStage) {
  const nested = recordValue(recordValue(payload)?.error)
  const googleStatus = stringValue(nested?.status)
  const numericCode = typeof nested?.code === "number" ? nested.code : null
  return {
    code: googleStatus ?? (numericCode === null ? `HTTP_${status}` : String(numericCode)),
    googleStatus,
    message: safeGoogleMessage(nested?.message, `Google Places ${stage} request failed.`),
  }
}

export async function googlePlacesFetch<T>(
  url: string,
  stage: "places-search" | "place-details",
  init?: Omit<RequestInit, "cache" | "signal">,
) {
  const apiKey = requireApiKey(stage)
  let response: Response
  try {
    response = await fetch(url, {
      ...init,
      headers: {
        Accept: "application/json",
        "X-Goog-Api-Key": apiKey,
        ...init?.headers,
      },
      cache: "no-store",
      signal: AbortSignal.timeout(10_000),
    })
  } catch {
    throw new GooglePlacesServiceError(
      "Google Places request could not be completed.",
      "NETWORK_ERROR",
      stage,
      503,
    )
  }

  const payload = await response.json().catch(() => null)
  if (!response.ok) {
    const details = errorDetails(payload, response.status, stage)
    throw new GooglePlacesServiceError(details.message, details.code, stage, response.status, details.googleStatus)
  }
  if (!payload) {
    throw new GooglePlacesServiceError("Google Places returned an invalid JSON response.", "INVALID_RESPONSE", stage, 502)
  }
  return payload as T
}
