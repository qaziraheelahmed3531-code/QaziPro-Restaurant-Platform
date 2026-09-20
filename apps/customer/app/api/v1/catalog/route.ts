import { apiError, apiSuccess } from "@/lib/api/v1"
import { getStorefrontSnapshot } from "@/lib/storefront/server"

export async function GET() {
  const snapshot = await getStorefrontSnapshot()
  if (!snapshot.business.id || !snapshot.branch.id) return apiError(snapshot.resolutionError??"STOREFRONT_CONTEXT_REQUIRED","Resolve a restaurant and branch before loading the catalog.",409)
  return apiSuccess({businessId:snapshot.business.id,branchId:snapshot.branch.id,menuSections:snapshot.menuSections,products:snapshot.products,deals:snapshot.deals})
}
