export type StatusTone = "success" | "danger" | "warning" | "neutral"

// Match whole canonical states, never substrings (INACTIVE contains ACTIVE).
export function statusTone(value: unknown): StatusTone {
  const state = String(value ?? "UNKNOWN").split(":").at(-1)!.trim().toUpperCase().replaceAll(" ", "_")
  if (["ACTIVE", "READY", "HEALTHY", "CONNECTED", "VERIFIED", "PUBLISHED", "RESOLVED", "ENABLED", "AUTHORIZED", "ACTIVATED", "COMPLETED", "SENT"].includes(state)) return "success"
  if (["CRITICAL", "FAILED", "SUSPENDED", "REVOKED", "PAST_DUE", "INVALID", "ERROR"].includes(state)) return "danger"
  if (["WARNING", "PENDING", "ONBOARDING", "CONFIGURATION", "CLIENT_REVIEW", "TRIAL", "UNKNOWN", "MISSING", "BLOCKED", "UNVERIFIED", "DEGRADED", "SENDING", "QUEUED", "BUILDING"].includes(state)) return "warning"
  return "neutral"
}
