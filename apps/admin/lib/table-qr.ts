import "server-only"
import { requirePermission } from "@/lib/auth"
import { createClient } from "@/lib/supabase/server"
import { resolveCustomerOrigin } from "@/lib/customer-origin"

export class TableQrConfigurationError extends Error {}

export async function getTableQr(tableId: string) {
  const context = await requirePermission("settings.manage")
  if (!/^[a-f0-9-]{36}$/i.test(tableId)) return null
  const db = await createClient()
  // Session client preserves branch RLS; never a service-role lookup by ID alone.
  const [{ data: table, error }, originResult] = await Promise.all([
    db.from("restaurant_tables")
      .select("id,name,code,is_active,public_token,branch_id")
      .eq("business_id", context.businessId).eq("id", tableId).maybeSingle(),
    resolveCustomerOrigin(db, context.businessId).then(origin => ({ origin, error: null })).catch(error => ({ origin: "", error })),
  ])
  if (error || !table) return null
  if (originResult.error) throw new TableQrConfigurationError("The restaurant website is not ready for QR ordering. Ask your platform administrator to check its domain and website access.")
  return { table, restaurantName: context.businessName, url: `${originResult.origin}/t/${table.public_token}` }
}
