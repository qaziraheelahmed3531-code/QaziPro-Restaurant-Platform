import { NextRequest } from "next/server"

import { apiFailure, apiRequestId, apiSuccess } from "@/lib/api/v1"
import { requireMobileStorefront } from "@/lib/api/mobile-context"

export async function GET(request: NextRequest) {
  const requestId=apiRequestId(request)
  try {
    const {snapshot}=await requireMobileStorefront(request)
    return apiSuccess({restaurantKey:snapshot.business.slug,businessId:snapshot.business.id,branchId:snapshot.branch.id,menuSections:snapshot.menuSections,products:snapshot.products,deals:snapshot.deals},200,requestId)
  } catch(error){return apiFailure(error,requestId,{route:"/api/v1/catalog"})}
}
