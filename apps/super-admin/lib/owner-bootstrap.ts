type OwnerIdentity = {
  email?: string | null
  email_confirmed_at?: string | null
  identities?: Array<{ provider?: string; identity_data?: Record<string, unknown> }> | null
}

// Initial bootstrap is an explicit exception to staff membership. It requires
// a verified Google identity; knowing an allowlisted email is insufficient.
export function canBootstrapPlatformOwner(user: OwnerIdentity | null, allowlist: string) {
  const email = user?.email?.trim().toLowerCase()
  if (!email || !user?.email_confirmed_at) return false
  if (!allowlist.split(",").some(value => value.trim().toLowerCase() === email)) return false
  return Boolean(user.identities?.some(identity =>
    identity.provider === "google" &&
    identity.identity_data?.email_verified === true &&
    String(identity.identity_data?.email ?? "").toLowerCase() === email,
  ))
}
