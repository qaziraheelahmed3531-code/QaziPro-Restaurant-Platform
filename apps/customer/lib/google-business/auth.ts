import "server-only"

type AccessTokenResponse = {
  access_token?: unknown
  expires_in?: unknown
}

type UnknownRecord = Record<string, unknown>

export type GoogleBusinessRequestStage = "configuration" | "oauth" | "reviews" | "location"

let cachedToken: { value: string; expiresAt: number } | null = null
let pendingToken: Promise<string> | null = null

function recordValue(value: unknown): UnknownRecord | null {
  return typeof value === "object" && value !== null ? value as UnknownRecord : null
}

function stringValue(value: unknown) {
  return typeof value === "string" && value.trim() ? value.trim() : null
}

function safeProviderMessage(value: unknown, fallback: string) {
  const message = stringValue(value)
  if (!message) return fallback
  if (/has not been used.+before or it is disabled/i.test(message)) {
    return "Google My Business API is disabled or has not previously been used for the configured Google Cloud project."
  }
  return message
    .replace(/https?:\/\/\S+/gi, "Google Cloud Console")
    .replace(/projects?\/[0-9]+/gi, "the configured project")
    .replace(/project\s+[0-9]+/gi, "the configured project")
    .replace(/\s+/g, " ")
    .trim()
    .slice(0, 300)
}

function quotaLimitIsZero(payload: unknown) {
  try {
    return /"quotaLimitValue"\s*:\s*"?0"?/i.test(JSON.stringify(payload))
  } catch {
    return false
  }
}

function providerError(payload: unknown, httpStatus: number, stage: GoogleBusinessRequestStage) {
  const root = recordValue(payload)
  const nested = recordValue(root?.error)
  const oauthCode = stringValue(root?.error)
  const googleStatus = stringValue(nested?.status)
  const numericCode = typeof nested?.code === "number" ? nested.code : null
  const code = googleStatus ?? oauthCode ?? (numericCode !== null ? String(numericCode) : `HTTP_${httpStatus}`)
  const rawMessage = nested?.message ?? root?.error_description
  const fallback = stage === "oauth" ? "Google OAuth authorization failed." : "Google Business Profile request failed."
  const sanitizedMessage = safeProviderMessage(rawMessage, fallback)
  const quotaLimitValueZero = quotaLimitIsZero(payload)
  const message = httpStatus === 429
    ? `Google Business Profile API quota/access is currently blocking the reviews request. quota_limit_value is ${quotaLimitValueZero ? "0" : "not 0 or was not returned"}. ${sanitizedMessage}`
    : httpStatus === 401
      ? `Google OAuth token/authorization problem. ${sanitizedMessage}`
      : httpStatus === 403
        ? `Google Business Profile API permission/access problem. ${sanitizedMessage}`
        : httpStatus === 404
          ? `The Account ID / Location ID pair may not identify a valid managed location. ${sanitizedMessage}`
          : sanitizedMessage
  return {
    code,
    googleStatus,
    message,
    quotaLimitValueZero,
  }
}

export class GoogleBusinessServiceError extends Error {
  constructor(
    message: string,
    public readonly code: string,
    public readonly stage: GoogleBusinessRequestStage,
    public readonly httpStatus: number,
    public readonly googleStatus: string | null = null,
    public readonly quotaLimitValueZero = false,
  ) {
    super(message)
    this.name = "GoogleBusinessServiceError"
  }
}

export function getGoogleBusinessConfig() {
  const clientId = process.env.GOOGLE_BUSINESS_CLIENT_ID?.trim()
  const clientSecret = process.env.GOOGLE_BUSINESS_CLIENT_SECRET?.trim()
  const refreshToken = process.env.GOOGLE_BUSINESS_OAUTH_REFRESH_TOKEN?.trim()
  const accountId = process.env.GOOGLE_BUSINESS_ACCOUNT_ID?.trim()
  const locationId = process.env.GOOGLE_BUSINESS_LOCATION_ID?.trim()
  if (!clientId || !clientSecret || !refreshToken || !accountId || !locationId) {
    throw new GoogleBusinessServiceError(
      "Google Business Profile environment variables are incomplete.",
      "NOT_CONFIGURED",
      "configuration",
      503,
    )
  }
  return {
    clientId,
    clientSecret,
    refreshToken,
    accountId: accountId.replace(/^accounts\//, ""),
    locationId: locationId.replace(/^.*locations\//, ""),
  }
}

async function refreshAccessToken() {
  const config = getGoogleBusinessConfig()
  let response: Response
  try {
    response = await fetch("https://oauth2.googleapis.com/token", {
      method: "POST",
      headers: { "Content-Type": "application/x-www-form-urlencoded", Accept: "application/json" },
      body: new URLSearchParams({
        client_id: config.clientId,
        client_secret: config.clientSecret,
        refresh_token: config.refreshToken,
        grant_type: "refresh_token",
      }),
      cache: "no-store",
      signal: AbortSignal.timeout(8_000),
    })
  } catch {
    throw new GoogleBusinessServiceError("Google OAuth request could not be completed.", "OAUTH_NETWORK_ERROR", "oauth", 503)
  }

  const payload = await response.json().catch(() => null) as AccessTokenResponse | UnknownRecord | null
  if (!response.ok) {
    const details = providerError(payload, response.status, "oauth")
    throw new GoogleBusinessServiceError(
      details.message,
      details.code,
      "oauth",
      response.status,
      details.googleStatus,
      details.quotaLimitValueZero,
    )
  }

  const value = typeof payload?.access_token === "string" ? payload.access_token : null
  const expiresIn = typeof payload?.expires_in === "number" ? payload.expires_in : 3_600
  if (!value) {
    throw new GoogleBusinessServiceError("Google OAuth returned an invalid token response.", "INVALID_OAUTH_RESPONSE", "oauth", 502)
  }
  cachedToken = { value, expiresAt: Date.now() + Math.max(60, expiresIn - 60) * 1_000 }
  return value
}

export async function getGoogleBusinessAccessToken() {
  if (cachedToken && cachedToken.expiresAt > Date.now()) return cachedToken.value
  if (!pendingToken) pendingToken = refreshAccessToken().finally(() => { pendingToken = null })
  return pendingToken
}

export async function googleBusinessFetch<T>(url: string, stage: "reviews" | "location") {
  const accessToken = await getGoogleBusinessAccessToken()
  let response: Response
  try {
    response = await fetch(url, {
      headers: { Authorization: `Bearer ${accessToken}`, Accept: "application/json" },
      cache: "no-store",
      signal: AbortSignal.timeout(8_000),
    })
  } catch {
    throw new GoogleBusinessServiceError("Google Business Profile request could not be completed.", "UPSTREAM_NETWORK_ERROR", stage, 503)
  }

  const payload = await response.json().catch(() => null)
  if (!response.ok) {
    const details = providerError(payload, response.status, stage)
    throw new GoogleBusinessServiceError(
      details.message,
      details.code,
      stage,
      response.status,
      details.googleStatus,
      details.quotaLimitValueZero,
    )
  }
  if (!payload) {
    throw new GoogleBusinessServiceError("Google Business Profile returned an invalid response.", "INVALID_API_RESPONSE", stage, 502)
  }
  return payload as T
}
