import "server-only"

import { createAdminClient } from "@/lib/supabase/admin"
import { createClient } from "@/lib/supabase/server"

function normalizedPhone(value: string) {
  return value.replace(/[^0-9]/g, "")
}

export async function getCurrentCustomerRestriction(businessId: string) {
  try {
    const session = await createClient()
    const { data: { user } } = await session.auth.getUser()
    if (!user) return null
    const email = user.email?.trim().toLowerCase() ?? ""
    const phone = normalizedPhone(String(user.user_metadata?.phone ?? user.phone ?? ""))
    const filters = ["auth_user_id.eq." + user.id]
    if (email) filters.push("normalized_email.eq." + email)
    if (phone) filters.push("normalized_phone.eq." + phone)
    const { data } = await createAdminClient().from("customer_restrictions").select("id,prevent_storefront_access,prevent_new_orders").eq("business_id", businessId).eq("is_active", true).eq("status", "BLOCKED").or(filters.join(",")).limit(1).maybeSingle()
    return data ?? null
  } catch {
    return null
  }
}

export async function assertCustomerMutationAllowed(businessId: string, scope: "order" | "access" = "order") {
  const restriction = await getCurrentCustomerRestriction(businessId)
  if ((scope === "access" && restriction?.prevent_storefront_access) || (scope === "order" && restriction?.prevent_new_orders)) throw new Error("This account is currently restricted.")
}
