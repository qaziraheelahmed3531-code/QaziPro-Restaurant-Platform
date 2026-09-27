"use server"

import { getAdminContext } from "@/lib/auth"
import { createClient } from "@/lib/supabase/server"
import { syncNearbyDeliveryAreas } from "@italian-pizza/shared/nearby-delivery-areas"

export async function autoPopulateBranchAreas(branchId: string) {
  const context = await getAdminContext()
  if (!context || (context.role !== "OWNER" && !context.permissions.some(value => ["delivery.manage", "branches.manage"].includes(value))) || !context.allowedBranchIds.includes(branchId)) {
    return { ok: false, count: 0, message: "You do not have access to configure this branch's delivery areas." }
  }
  const db = await createClient()
  return syncNearbyDeliveryAreas({
    readBranch: async () => {
      const result = await db.from("branches").select("id,latitude,longitude").eq("id", branchId).eq("business_id", context.businessId).single()
      if (result.error) throw new Error("Branch access denied")
      return result.data
    },
    importAreas: async (point, candidates) => {
      const result = await db.rpc("auto_populate_branch_delivery_areas", { p_branch_id: branchId, p_latitude: point.latitude, p_longitude: point.longitude, p_candidates: candidates })
      if (result.error) throw new Error("Area import failed")
      return Number(result.data?.importedCount ?? 0)
    },
  }, process.env.GEOAPIFY_API_KEY ?? "")
}
