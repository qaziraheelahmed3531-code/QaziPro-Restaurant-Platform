import type { NextRequest } from "next/server"

import { apiFailure, apiRequestId, apiSuccess, requireBearerSession } from "@/lib/api/v1"
import { requireMobileStorefront } from "@/lib/api/mobile-context"

export async function GET(request: NextRequest) {
  const requestId=apiRequestId(request)
  try {
    const [{snapshot},session]=await Promise.all([requireMobileStorefront(request,{branch:false}),requireBearerSession(request)])
    return apiSuccess({authenticated:true,user:{id:session.identity.id,email:session.identity.email},restaurantKey:snapshot.business.slug},200,requestId)
  } catch(error){return apiFailure(error,requestId,{route:"/api/v1/auth/session"})}
}
