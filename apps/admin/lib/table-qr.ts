import "server-only"
import { requirePermission } from "@/lib/auth"
import { createClient } from "@/lib/supabase/server"
import { resolveCustomerOrigin } from "@/lib/customer-origin"

export async function getTableQr(tableId: string) {
  const context = await requirePermission("settings.manage")
  if (!/^[a-f0-9-]{36}$/i.test(tableId)) return null
  const db = await createClient()
  // Session client preserves branch RLS; never a service-role lookup by ID alone.
  const { data: table, error } = await db.from("restaurant_tables")
    .select("id,name,code,is_active,public_token,branch_id")
    .eq("business_id", context.businessId).eq("id", tableId).maybeSingle()
  if (error || !table) return null
  const origin = await resolveCustomerOrigin(db, context.businessId)
  return { table, restaurantName: context.businessName, url: `${origin}/t/${table.public_token}` }
}
