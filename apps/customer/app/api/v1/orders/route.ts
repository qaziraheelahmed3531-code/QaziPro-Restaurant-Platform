import { NextRequest } from "next/server"

import { apiError, apiRequestId, apiSuccess, bearerIdentity, consumeRateLimit, parseJson, reportApiError } from "@/lib/api/v1"
import { createOrder, listCustomerOrders, type OrderInput } from "@/lib/orders/server"
import { getStorefrontSnapshot } from "@/lib/storefront/server"

function failure(error: unknown, requestId: string, branchId?: string) {
  const known=error as {message?:string;status?:number;code?:string}
  const message=known.message??"The order request could not be completed."
  const safe=/gen_random_bytes|postgres|postgrest|pgrst|relation .* does not exist|column .* does not exist|function .* does not exist/i.test(message)?"The ordering service is temporarily unavailable.":message
  reportApiError(error,{requestId,route:"/api/v1/orders",branchId})
  return apiError(known.code??"ORDER_REQUEST_FAILED",safe,known.status??400,undefined,requestId)
}

export async function GET(request: NextRequest) {
  const requestId=apiRequestId(request)
  try {
    const identity=await bearerIdentity(request)
    if(!identity)return apiError("AUTH_REQUIRED","Use a valid Supabase access token.",401,undefined,requestId)
    return apiSuccess({orders:await listCustomerOrders(identity)},200,requestId)
  } catch(error){return failure(error,requestId)}
}

export async function POST(request: NextRequest) {
  const requestId=apiRequestId(request)
  let branchId: string | undefined
  try {
    const payload=await parseJson(request) as OrderInput
    if(!payload||typeof payload!=="object")return apiError("INVALID_ORDER","Order body is required.",400,undefined,requestId)
    branchId=payload.branchId
    if(!await consumeRateLimit(request,"checkout",10,60,payload.branchId??"unresolved"))return apiError("RATE_LIMITED","Too many order attempts. Wait a minute and retry.",429,undefined,requestId)
    const identity=await bearerIdentity(request)
    const storefront=await getStorefrontSnapshot({branchId:payload.branchId,hostname:request.headers.get("x-forwarded-host")??request.headers.get("host")})
    const order=await createOrder(payload,storefront,identity??undefined)
    return apiSuccess({order},201,requestId)
  } catch(error){return failure(error,requestId,branchId)}
}
