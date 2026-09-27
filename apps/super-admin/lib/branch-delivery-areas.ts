import "server-only"
import { createClient } from "@/lib/supabase/server"
import { syncNearbyDeliveryAreas } from "@italian-pizza/shared/nearby-delivery-areas"

/** Caller has already authorized branch creation/update; the RPC also checks platform permissions. */
export async function populatePlatformBranchAreas(businessId: string, branchId?: string) {
  const db = await createClient()
  let query = db.from("branches").select("id,latitude,longitude").eq("business_id", businessId).eq("is_active", true)
  if (branchId) query = query.eq("id", branchId)
  const result = await query
  if (result.error || !result.data?.length) return false
  const statuses = await Promise.all(result.data.map(branch => syncNearbyDeliveryAreas({
    readBranch: async () => branch,
    importAreas: async (point, candidates) => {
      const imported = await db.rpc("auto_populate_branch_delivery_areas", { p_branch_id: branch.id, p_latitude: point.latitude, p_longitude: point.longitude, p_candidates: candidates })
      if (imported.error) throw new Error("Area import failed")
      return Number(imported.data?.importedCount ?? 0)
    },
  }, process.env.GEOAPIFY_API_KEY ?? "")))
  return statuses.every(status => status.ok)
}
