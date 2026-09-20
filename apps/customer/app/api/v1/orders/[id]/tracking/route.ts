import type { NextRequest } from "next/server"

import { ApiProblem, apiFailure, apiRequestId, apiSuccess, bearerIdentity, consumeRateLimit } from "@/lib/api/v1"
import { requireMobileStorefront } from "@/lib/api/mobile-context"
import { getAccessibleOrder } from "@/lib/orders/server"

type Context={params:Promise<{id:string}>}
export async function GET(request: NextRequest,{params}:Context) {
  const requestId=apiRequestId(request)
  try {
    const orderNumber=(await params).id.trim().toUpperCase()
    if(!/^[A-Z0-9-]{4,80}$/.test(orderNumber))throw new ApiProblem("INVALID_ORDER_NUMBER","Order number is invalid.",422)
    const {snapshot}=await requireMobileStorefront(request,{branch:false})
    if(!await consumeRateLimit(request,"order-tracking",60,60,snapshot.business.id!))throw new ApiProblem("RATE_LIMITED","Too many tracking attempts.",429)
    const identity=await bearerIdentity(request),guestToken=request.headers.get("x-order-token")
    if(!identity&&!guestToken)throw new ApiProblem("ORDER_ACCESS_REQUIRED","Use a Bearer token or guest order token.",401)
    const order=await getAccessibleOrder(orderNumber,guestToken,identity,snapshot.business.id!) as Record<string,unknown>|null
    if(!order)throw new ApiProblem("ORDER_NOT_FOUND","Order not found.",404)
    return apiSuccess({orderNumber:order.order_number,status:order.status,history:order.order_status_history??[],riderLocation:order.rider_live_locations??null,updatedAt:order.updated_at},200,requestId)
  } catch(error){return apiFailure(error,requestId,{route:"/api/v1/orders/:id/tracking"})}
}
