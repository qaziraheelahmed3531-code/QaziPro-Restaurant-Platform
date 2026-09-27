import "server-only"

import { normalizeHostname } from "@italian-pizza/shared/domains"
import type { createClient } from "@/lib/supabase/server"

/** Use the same verified mapping and public lifecycle resolver as the storefront. */
export async function resolveCustomerOrigin(db: Awaited<ReturnType<typeof createClient>>, businessId: string) {
  const { data: domain, error } = await db.from("business_domains")
    .select("hostname").eq("business_id", businessId).eq("is_primary", true)
    .eq("is_active", true).not("verified_at", "is", null).maybeSingle()
  if (error) throw new Error("The restaurant website address could not be checked. Try again before sending.")
  const hostname = normalizeHostname(domain?.hostname)
  if (!hostname || ["localhost", "127.0.0.1", "::1"].includes(hostname)) {
    throw new Error("Configure an active, verified primary Customer Website domain before sending customer messages.")
  }
  const { data: resolved, error: resolutionError } = await db.rpc("resolve_storefront_business", { p_hostname: hostname })
  if (resolutionError || resolved?.[0]?.resolved_business_id !== businessId) {
    throw new Error("The restaurant website is unavailable. Check its domain, active status and Website entitlement before sending.")
  }
  return `https://${hostname}`
}
