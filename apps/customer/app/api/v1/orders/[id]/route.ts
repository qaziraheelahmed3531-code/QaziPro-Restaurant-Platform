import type { NextRequest } from "next/server"

import { ApiProblem, apiFailure, apiRequestId, apiSuccess, bearerIdentity, consumeRateLimit } from "@/lib/api/v1"
import { requireMobileStorefront } from "@/lib/api/mobile-context"
import { getAccessibleOrder } from "@/lib/orders/server"

type Context={params:Promise<{id:string}>}
function number(value:string){const normalized=value.trim().toUpperCase();if(!/^[A-Z0-9-]{4,80}$/.test(normalized))throw new ApiProblem("INVALID_ORDER_NUMBER","Order number is invalid.",422);return normalized}

export async function GET(request: NextRequest,{params}:Context) {
  const requestId=apiRequestId(request)
  try {
    const orderNumber=number((await params).id),{snapshot}=await requireMobileStorefront(request,{branch:false})
    if(!await consumeRateLimit(request,"order-detail",60,60,snapshot.business.id!))throw new ApiProblem("RATE_LIMITED","Too many tracking attempts.",429)
    const identity=await bearerIdentity(request),guestToken=request.headers.get("x-order-token")
    if(!identity&&!guestToken)throw new ApiProblem("ORDER_ACCESS_REQUIRED","Use a Bearer token or guest order token.",401)
    const order=await getAccessibleOrder(orderNumber,guestToken,identity,snapshot.business.id!) as Record<string,unknown>|null
    if(!order)throw new ApiProblem("ORDER_NOT_FOUND","Order not found.",404)
    const items=Array.isArray(order.order_items)?order.order_items as Array<Record<string,unknown>>:[]
    const reorder={branchId:order.branch_id,serviceMode:order.service_mode,items:items.map(item=>({itemKind:item.item_kind,productId:item.product_id,variantId:item.variant_id,quantity:item.quantity,modifiers:Array.isArray(item.order_item_modifiers)?(item.order_item_modifiers as Array<Record<string,unknown>>).map(modifier=>({groupId:modifier.modifier_group_id,optionId:modifier.modifier_option_id})):[]}))}
    return apiSuccess({order,reorder},200,requestId)
  } catch(error){return apiFailure(error,requestId,{route:"/api/v1/orders/:id"})}
}
