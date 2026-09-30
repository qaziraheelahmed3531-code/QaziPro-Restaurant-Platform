import "server-only"

import { redirect } from "next/navigation"
import { cookies } from "next/headers"
import { cache } from "react"
import { createClient, isSupabaseConfigured } from "@/lib/supabase/server"
import { entitlementAllows, runtimeCapabilityKeys } from "@/lib/entitlements"

export type AdminContext = {
  userId: string
  email: string
  businessId: string
  businessName: string
  activeBranchId: string | null
  assignedBranchId: string | null
  allowedBranchIds: string[]
  role: "OWNER" | "MANAGER" | "CASHIER" | "KITCHEN" | "WAITER" | "RIDER" | "STAFF"
  permissions: string[]
  capabilities: Record<string,boolean>
  activeBranch?: {id:string;name:string;restaurant_name:string|null;city:string;timezone:string;location_revision:number;address:string|null;formatted_address:string|null;phone:string|null;pickup_enabled:boolean;delivery_enabled:boolean}|null
}

export type AdminAccessReason =
  | "AUTHORIZED" | "AUTHENTICATION_REQUIRED" | "NO_MEMBERSHIP"
  | "MEMBERSHIP_INACTIVE" | "MEMBERSHIP_LINK_INCOMPLETE"
  | "INVITATION_INCOMPLETE" | "INVITATION_EXPIRED" | "INVITATION_REVOKED"
  | "RESTAURANT_INACTIVE" | "RESTAURANT_SUSPENDED" | "BUSINESS_NOT_FOUND"
  | "BRANCH_ACCESS_MISSING" | "ENTITLEMENT_MISSING" | "ENTITLEMENT_DISABLED"
  | "SUBSCRIPTION_SUSPENDED" | "SUBSCRIPTION_CANCELLED" | "UNKNOWN"

export type AdminAccessResolution = {
  allowed: boolean
  reason: AdminAccessReason
  membershipId?: string
  businessId?: string
  businessName?: string
  role?: AdminContext["role"]
  branchIds?: string[]
  capability?: string
  entitlementReason?: string
}

const getAdminAuthState = cache(async () => {
  const supabase = await createClient()
  const [{ data: claimsResult }, cookieStore] = await Promise.all([supabase.auth.getClaims(), cookies()])
  return { supabase, claims: claimsResult?.claims, cookieStore }
})

export const getAdminAccessResolution = cache(async (): Promise<AdminAccessResolution> => {
  if (!isSupabaseConfigured()) return { allowed: false, reason: "UNKNOWN" }
  const { supabase, claims, cookieStore } = await getAdminAuthState()
  const userId = typeof claims?.sub === "string" ? claims.sub : ""
  if (!userId) return { allowed: false, reason: "AUTHENTICATION_REQUIRED" }
  const requestedBusiness = cookieStore.get("ip-admin-business")?.value
  const { data, error } = await supabase.rpc("resolve_restaurant_admin_access", { p_business_id: requestedBusiness || null })
  if (error || !data || typeof data !== "object") return { allowed: false, reason: "UNKNOWN" }
  const resolution = data as Record<string, unknown>
  return {
    allowed: resolution.allowed === true,
    reason: String(resolution.reason ?? "UNKNOWN") as AdminAccessReason,
    membershipId: resolution.membershipId ? String(resolution.membershipId) : undefined,
    businessId: resolution.businessId ? String(resolution.businessId) : undefined,
    businessName: resolution.businessName ? String(resolution.businessName) : undefined,
    role: resolution.role as AdminContext["role"] | undefined,
    branchIds: Array.isArray(resolution.branchIds) ? resolution.branchIds.map(String) : [],
    capability: resolution.capability ? String(resolution.capability) : undefined,
    entitlementReason: resolution.entitlementReason ? String(resolution.entitlementReason) : undefined,
  }
})

export function accessReasonQuery(reason: AdminAccessReason) {
  const values: Partial<Record<AdminAccessReason,string>> = {
    NO_MEMBERSHIP: "no-membership", MEMBERSHIP_INACTIVE: "membership-inactive",
    MEMBERSHIP_LINK_INCOMPLETE: "membership-link", INVITATION_INCOMPLETE: "invitation-incomplete",
    INVITATION_EXPIRED: "invitation-expired", INVITATION_REVOKED: "invitation-revoked",
    RESTAURANT_INACTIVE: "restaurant-inactive", RESTAURANT_SUSPENDED: "restaurant-suspended",
    BUSINESS_NOT_FOUND: "restaurant-missing", BRANCH_ACCESS_MISSING: "branch-access",
    ENTITLEMENT_MISSING: "entitlement-missing", ENTITLEMENT_DISABLED: "entitlement-disabled",
    SUBSCRIPTION_SUSPENDED: "subscription-suspended", SUBSCRIPTION_CANCELLED: "subscription-cancelled",
  }
  return values[reason] ?? "unauthorized"
}

export const getAdminContext = cache(async (): Promise<AdminContext | null> => {
  if (!isSupabaseConfigured()) return null
  const { supabase, claims, cookieStore } = await getAdminAuthState()
  const userId = typeof claims?.sub === "string" ? claims.sub : ""
  if (!userId) return null
  const access = await getAdminAccessResolution()
  if (!access.allowed || !access.membershipId || !access.businessId || !access.role) return null
  const requestedBranch = cookieStore.get("ip-admin-branch")?.value
  const resolvedBranches=access.branchIds??[]
  const anticipatedBranch=requestedBranch&&requestedBranch!=="all"
    ? (resolvedBranches.includes(requestedBranch)?requestedBranch:null)
    : resolvedBranches.length===1?resolvedBranches[0]:null
  const entitlementRequest=(branchId:string|null)=>supabase.rpc("resolve_runtime_entitlements",{
    p_business_id:access.businessId!,p_branch_id:branchId,p_capability_keys:[...runtimeCapabilityKeys],
  })
  // All three reads are scoped by the canonical access resolution. Starting
  // them together removes one network waterfall without caching authorization.
  const [membershipResult,permissionResult,branchesResult,anticipatedEntitlements] = await Promise.all([
    supabase.from("staff_memberships")
    .select("business_id,branch_id,role,businesses!inner(name),staff_membership_branches(branch_id)")
    .eq("id", access.membershipId).eq("user_id", userId).eq("is_active", true).maybeSingle(),
    access.role === "OWNER" ? Promise.resolve({ data: [], error: null }) : supabase.rpc("effective_permissions", { p_business_id: access.businessId }),
    supabase.from("branches").select("id,restaurant_name,name,city,timezone,location_revision,address,formatted_address,phone,pickup_enabled,delivery_enabled").eq("business_id",access.businessId).eq("is_active",true).order("sort_order"),
    entitlementRequest(anticipatedBranch),
  ])
  const data = membershipResult.data
  if (!data) return null
  if(data.business_id!==access.businessId || data.role!==access.role || permissionResult.error || branchesResult.error)return null
  const business = Array.isArray(data.businesses) ? data.businesses[0] : data.businesses
  const permissionRows = permissionResult.data
  const allBranches=branchesResult.data??[]
  const mapped=(data.staff_membership_branches??[]).map((row:{branch_id:string})=>String(row.branch_id))
  const legacyBranch=String(data.branch_id??"")
  const allowedBranchIds=data.role==="OWNER"?allBranches.map(row=>String(row.id)):Array.from(new Set([...mapped,...(legacyBranch?[legacyBranch]:[])]))
  const availableBranches=allBranches.filter(row=>allowedBranchIds.includes(String(row.id)))
  const selectedBranch=requestedBranch&&requestedBranch!=="all"?availableBranches.find(row=>String(row.id)===requestedBranch):availableBranches.length===1?availableBranches[0]:null
  const assignedBranchId=data.role==="OWNER"||allowedBranchIds.length!==1?null:allowedBranchIds[0]
  // Canonical resolver scopes the parallel request. If branch state changed
  // during resolution, discard its result and resolve the actual selection.
  const entitlementResult=(selectedBranch?.id??null)===anticipatedBranch?anticipatedEntitlements:await entitlementRequest(selectedBranch?.id??null)
  const entitlementRows=(entitlementResult.data??{}) as Record<string,{enabled?:boolean}>
  const capabilities=Object.fromEntries(runtimeCapabilityKeys.map(key=>[key,Boolean(entitlementRows[key]?.enabled)]))
  return {
    userId,
    email: typeof claims?.email === "string" ? claims.email : "Staff account",
    businessId: String(data.business_id),
    businessName: String(selectedBranch?.restaurant_name ?? access.businessName ?? (business as { name?: string } | null)?.name ?? "Restaurant"),
    activeBranchId: selectedBranch?.id ? String(selectedBranch.id) : null,
    assignedBranchId,
    allowedBranchIds,
    role: data.role as AdminContext["role"],
    permissions: data.role === "OWNER" ? ["*"] : (permissionRows ?? []).map(String),
    capabilities,
    activeBranch:selectedBranch??null,
  }
})

export async function requirePermission(permission: string) {
  const context = await requireAdmin()
  if ((context.role !== "OWNER" && !context.permissions.includes(permission)) || !entitlementAllows(context.capabilities,permission)) {
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
  return routes.find(([permission]) => (context.role === "OWNER" || context.permissions.includes(permission)) && entitlementAllows(context.capabilities,permission))?.[1] ?? "/access-denied"
}
