import type { NextRequest } from "next/server"

import { apiFailure, apiRequestId, apiSuccess, requireBearerSession } from "@/lib/api/v1"
import { requireMobileStorefront } from "@/lib/api/mobile-context"
import { requireRuntimeEntitlements } from "@/lib/entitlements/server"

export async function GET(request: NextRequest) {
  const requestId=apiRequestId(request)
  try {
    const [{snapshot},session]=await Promise.all([requireMobileStorefront(request,{branch:false}),requireBearerSession(request)])
    await requireRuntimeEntitlements(snapshot.business.id!,null,["loyalty"])
    const {data,error}=await session.client.rpc("customer_loyalty_wallet",{p_business_id:snapshot.business.id!})
    if(error)throw error
    return apiSuccess({wallet:data},200,requestId)
  } catch(error){return apiFailure(error,requestId,{route:"/api/v1/loyalty"})}
}
