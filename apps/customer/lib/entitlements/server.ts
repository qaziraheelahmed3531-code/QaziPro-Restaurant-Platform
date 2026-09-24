import "server-only"

import { createAdminClient } from "@/lib/supabase/admin"

export type RuntimeEntitlement = {
  enabled: boolean
  reason: string
  source: string
  packageCode: string | null
  limit: number | null
}

export async function runtimeEntitlements(
  businessId: string,
  branchId: string | null,
  capabilities: string[],
) {
  const unique=[...new Set(capabilities)]
  const {data,error}=await createAdminClient().rpc("resolve_runtime_entitlements",{
    p_business_id:businessId,
    p_branch_id:branchId,
    p_capability_keys:unique,
  })
  if(error)throw Object.assign(new Error("Restaurant service access could not be verified."),{status:503,code:"ENTITLEMENT_CHECK_UNAVAILABLE"})
  return (data??{}) as Record<string,RuntimeEntitlement>
}

export async function requireRuntimeEntitlements(
  businessId: string,
  branchId: string | null,
  capabilities: string[],
) {
  const resolved=await runtimeEntitlements(businessId,branchId,capabilities)
  const denied=capabilities.find(capability=>!resolved[capability]?.enabled)
  if(denied)throw Object.assign(new Error("This service is not enabled for the restaurant."),{
    status:403,
    code:"SERVICE_NOT_ENABLED",
    details:{capability:denied,reason:resolved[denied]?.reason??"ENTITLEMENT_MISSING"},
  })
  return resolved
}
