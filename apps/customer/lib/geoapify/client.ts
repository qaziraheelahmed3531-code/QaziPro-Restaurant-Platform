import "server-only"

const GEOAPIFY_ORIGIN = "https://api.geoapify.com"

export class GeoapifyServiceError extends Error {
  constructor(
    message: string,
    public readonly code: "not-configured" | "upstream-error" | "invalid-response",
  ) {
    super(message)
    this.name = "GeoapifyServiceError"
  }
}

export async function getGeoapifyJson<T>(pathname: string, params: Record<string, string>) {
  const apiKey = process.env.GEOAPIFY_API_KEY?.trim()
  if (!apiKey) throw new GeoapifyServiceError("Location service is not configured.", "not-configured")

  const url = new URL(pathname, GEOAPIFY_ORIGIN)
  for (const [key, value] of Object.entries(params)) url.searchParams.set(key, value)
  url.searchParams.set("apiKey", apiKey)

  const response = await fetch(url, {
    headers: { Accept: "application/json" },
    cache: "no-store",
    signal: AbortSignal.timeout(8_000),
  })

  if (!response.ok) throw new GeoapifyServiceError("Location provider request failed.", "upstream-error")

  try {
    return (await response.json()) as T
  } catch {
    throw new GeoapifyServiceError("Location provider returned an invalid response.", "invalid-response")
  }
}

export function isCoordinate(value: number, minimum: number, maximum: number) {
  return Number.isFinite(value) && value >= minimum && value <= maximum
}

export function asString(value: unknown) {
  return typeof value === "string" && value.trim() ? value.trim() : null
}

export function asNumber(value: unknown) {
  return typeof value === "number" && Number.isFinite(value) ? value : null
}
