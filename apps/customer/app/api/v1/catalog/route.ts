import { NextRequest } from "next/server"

import { apiError, apiSuccess } from "@/lib/api/v1"
import { getStorefrontSnapshot } from "@/lib/storefront/server"

export async function GET(request: NextRequest) {
  const snapshot = await getStorefrontSnapshot({hostname:request.headers.get("x-forwarded-host")??request.headers.get("host")})
  if (!snapshot.business.id || !snapshot.branch.id) return apiError(snapshot.resolutionError??"STOREFRONT_CONTEXT_REQUIRED","Resolve a restaurant and branch before loading the catalog.",409)
  return apiSuccess({businessId:snapshot.business.id,branchId:snapshot.branch.id,menuSections:snapshot.menuSections,products:snapshot.products,deals:snapshot.deals})
}
