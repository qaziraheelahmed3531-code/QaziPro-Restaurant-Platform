const DEFAULT_SYNTHETIC_EMAIL_DOMAINS = [
  "staging.qazipro.invalid",
  "qa.example",
  "example.test",
] as const

function configuredSyntheticDomains() {
  const configured = typeof process !== "undefined"
    ? process.env.QAZIPRO_SYNTHETIC_EMAIL_DOMAINS?.split(",") ?? []
    : []
  return new Set([...DEFAULT_SYNTHETIC_EMAIL_DOMAINS, ...configured]
    .map((domain) => domain.trim().replace(/^@/, "").toLowerCase())
    .filter(Boolean))
}

export function isSyntheticQaEmail(value: string) {
  const email = value.trim().toLowerCase()
  const separator = email.lastIndexOf("@")
  if (separator <= 0 || separator === email.length - 1) return false
  const domain = email.slice(separator + 1)
  // .invalid is deliberately non-deliverable, including arbitrary subdomains.
  // Keep this guard independent of optional staging configuration.
  return domain === "invalid" || domain.endsWith(".invalid") || configuredSyntheticDomains().has(domain)
}

export type InvitationDeliveryStatus = "NOT_SENT" | "SENDING" | "SENT" | "FAILED" | "SUPPRESSED"

export async function deliverExternalInvitation(input: {
  recipient: string
  claim: (status: "SENDING" | "SUPPRESSED") => Promise<boolean>
  send: () => Promise<{ error?: unknown }>
  complete: (status: "SENT" | "FAILED") => Promise<void>
}) {
  if (isSyntheticQaEmail(input.recipient)) {
    const claimed = await input.claim("SUPPRESSED")
    return { attempted: false, claimed, status: "SUPPRESSED" as const }
  }
  const claimed = await input.claim("SENDING")
  if (!claimed) return { attempted: false, claimed: false, status: "NOT_SENT" as const }
  try {
    const result = await input.send()
    const status = result.error ? "FAILED" as const : "SENT" as const
    await input.complete(status)
    return { attempted: true, claimed: true, status, error: result.error }
  } catch (error) {
    await input.complete("FAILED")
    return { attempted: true, claimed: true, status: "FAILED" as const, error }
  }
}
