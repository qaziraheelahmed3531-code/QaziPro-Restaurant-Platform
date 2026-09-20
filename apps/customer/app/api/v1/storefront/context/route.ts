import { NextRequest } from "next/server"

import { apiError, apiSuccess, publicStorefront } from "@/lib/api/v1"
import { getStorefrontSnapshot } from "@/lib/storefront/server"

export async function GET(request: NextRequest) {
  const snapshot = await getStorefrontSnapshot({hostname:request.headers.get("x-forwarded-host")??request.headers.get("host")})
  if (!snapshot.business.id) return apiError(snapshot.resolutionError??"TENANT_NOT_FOUND","No active restaurant is configured for this domain.",404)
  if (!snapshot.branch.id) return apiError(snapshot.resolutionError??"BRANCH_REQUIRED","A branch must be selected.",409,{business:publicStorefront(snapshot).business,availableBranches:snapshot.availableBranches})
  return apiSuccess(publicStorefront(snapshot))
}
