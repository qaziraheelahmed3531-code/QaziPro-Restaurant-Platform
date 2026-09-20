import type { NextRequest } from "next/server"

import { apiFailure, apiRequestId, apiSuccess } from "@/lib/api/v1"
import { requireMobileStorefront } from "@/lib/api/mobile-context"

export async function GET(request: NextRequest) {
  const requestId=apiRequestId(request)
  try {
    await requireMobileStorefront(request,{branch:false})
    return apiSuccess({methods:[{id:"CASH_ON_DELIVERY",label:"Cash on delivery / pickup",enabled:true}],onlineGateway:null},200,requestId)
  } catch(error){return apiFailure(error,requestId,{route:"/api/v1/payments"})}
}
