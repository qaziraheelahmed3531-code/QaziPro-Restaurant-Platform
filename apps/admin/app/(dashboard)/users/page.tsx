import { StaffManager } from "@/components/staff-manager"
import { requirePermission } from "@/lib/auth"
import { createClient } from "@/lib/supabase/server"

export default async function Page() {
  const context = await requirePermission("staff.manage")
  const db = await createClient()
  const [{ data }, { data: branches }] = await Promise.all([
    db.from("admin_role_permissions").select("role,permission_code"),
    db.from("branches").select("id,name,restaurant_name,city").eq("business_id", context.businessId).eq("is_active", true).order("sort_order"),
  ])
  const presets: Record<string, string[]> = {}
  for (const row of data ?? []) (presets[row.role] ??= []).push(row.permission_code)
  return <StaffManager context={context} presets={presets} branches={branches ?? []}/>
}
