import "server-only"

import { redirect } from "next/navigation"
import { cookies } from "next/headers"
import { cache } from "react"
import { createClient, isSupabaseConfigured } from "@/lib/supabase/server"

export type AdminContext = {
  userId: string
  email: string
  businessId: string
  businessName: string
  activeBranchId: string | null
  assignedBranchId: string | null
  role: "OWNER" | "MANAGER" | "CASHIER" | "KITCHEN" | "WAITER" | "RIDER" | "STAFF"
  permissions: string[]
}

export const getAdminContext = cache(async (): Promise<AdminContext | null> => {
  if (!isSupabaseConfigured()) return null
  const supabase = await createClient()
  const [{ data: claimsResult }, cookieStore] = await Promise.all([
    supabase.auth.getClaims(),
    cookies(),
  ])
  const claims = claimsResult?.claims
  const userId = typeof claims?.sub === "string" ? claims.sub : ""
  if (!userId) return null
  const requestedBusiness = cookieStore.get("ip-admin-business")?.value
  const requestedBranch = cookieStore.get("ip-admin-branch")?.value
  const membershipQuery = (businessId?: string) => {
    let query = supabase.from("staff_memberships").select("business_id,branch_id,role,updated_at,businesses!inner(name,is_active)").eq("user_id", userId).eq("is_active", true).eq("businesses.is_active", true)
    if (businessId) query = query.eq("business_id", businessId)
    return query.order("updated_at", { ascending: false }).limit(1).maybeSingle()
  }
  let membershipResult = await membershipQuery(requestedBusiness)
  if (!membershipResult.data && requestedBusiness) membershipResult = await membershipQuery()
  const requestedBranchRequest = requestedBranch && requestedBranch !== "all"
    ? supabase.from("branches").select("id,business_id,restaurant_name,name,city").eq("id", requestedBranch).eq("is_active", true).maybeSingle()
    : Promise.resolve({ data: null })
  const [{ data }, requestedBranchResult] = await Promise.all([Promise.resolve(membershipResult), requestedBranchRequest])
  if (!data) return null
  const business = Array.isArray(data.businesses) ? data.businesses[0] : data.businesses
  const assignedBranchId = data.role === "OWNER" ? null : String(data.branch_id ?? "") || null
  const requestedBranchRow = requestedBranchResult.data
  const selectedRequestedBranch = requestedBranchRow && requestedBranchRow.business_id === data.business_id && (!assignedBranchId || requestedBranchRow.id === assignedBranchId) ? requestedBranchRow : null
  const needsDefaultBranch = assignedBranchId ? !selectedRequestedBranch : requestedBranch !== "all" && !selectedRequestedBranch
  const defaultBranchRequest = () => {
    let query = supabase.from("branches").select("id,restaurant_name,name,city").eq("business_id",data.business_id).eq("is_active",true)
    if (assignedBranchId) query = query.eq("id", assignedBranchId)
    return query.order("sort_order").limit(1).maybeSingle()
  }
  const [permissionResult, defaultBranchResult] = await Promise.all([
    data.role === "OWNER" ? Promise.resolve({ data: [] }) : supabase.rpc("effective_permissions", { p_business_id: data.business_id }),
    needsDefaultBranch ? defaultBranchRequest() : Promise.resolve({ data: null }),
  ])
  const permissionRows = permissionResult.data
  const selectedBranch = selectedRequestedBranch ?? defaultBranchResult.data
  return {
    userId,
    email: typeof claims?.email === "string" ? claims.email : "Staff account",
    businessId: String(data.business_id),
    businessName: String(selectedBranch?.restaurant_name ?? (business as { name?: string } | null)?.name ?? "Restaurant"),
    activeBranchId: selectedBranch?.id ? String(selectedBranch.id) : null,
    assignedBranchId,
    role: data.role as AdminContext["role"],
    permissions: data.role === "OWNER" ? ["*"] : (permissionRows ?? []).map(String),
  }
})

export async function requirePermission(permission: string) {
  const context = await requireAdmin()
  if (context.role !== "OWNER" && !context.permissions.includes(permission)) {
    const destination = adminHome(context)
    redirect(destination)
  }
  return context
}

export async function requireAdmin() {
  if (!isSupabaseConfigured()) redirect("/login?error=configuration")
  const context = await getAdminContext()
  if (!context) redirect("/login?error=unauthorized")
  return context
}

export function adminHome(context: AdminContext) {
  const routes: Array<[string,string]> = [["dashboard.view","/"],["waiter.use","/waiter"],["rider.use","/rider"],["pos.use","/pos"],["orders.read","/orders"],["kds.use","/kitchen"],["products.manage","/menu"],["categories.manage","/categories"],["modifiers.manage","/modifiers"],["deals.manage","/deals"],["loyalty.manage","/loyalty"],["invoices.read","/invoices"],["inventory.read","/inventory"],["ingredients.manage","/inventory/manage"],["recipes.manage","/recipes"],["purchases.manage","/purchases"],["suppliers.manage","/suppliers"],["wastage.manage","/wastage"],["social.manage","/content"],["payments.read","/payments"],["reports.read","/reports"],["staff.manage","/users"],["branding.manage","/appearance"],["content.manage","/content"],["banners.manage","/banners"],["delivery.manage","/delivery"],["branches.manage","/branches"],["hours.manage","/hours"],["customers.read","/customers"],["promotions.manage","/promotions"],["reviews.manage","/integrations"],["register.manage","/register"],["receipts.print","/receipts"],["audit.read","/audit-logs"],["notifications.read","/notifications"],["business.manage","/business"],["printing.manage","/printing"],["settings.manage","/settings"]]
  return context.role === "OWNER" ? "/" : routes.find(([permission]) => context.permissions.includes(permission))?.[1] ?? "/access-denied"
}
