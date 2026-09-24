import { NextRequest } from "next/server"

import { apiError, apiRequestId, apiSuccess, apiSuccessWithMeta, bearerIdentity, consumeRateLimit, decodeCursor, encodeCursor, listLimit, parseJson, reportApiError, requireBearerSession } from "@/lib/api/v1"
import { requireMobileStorefront } from "@/lib/api/mobile-context"
import { createOrder, listCustomerOrdersPage, type OrderInput } from "@/lib/orders/server"

function failure(error: unknown, requestId: string, branchId?: string) {
  const known=error as {message?:string;status?:number;code?:string}
  const message=known.message??"The order request could not be completed."
  const safe=/gen_random_bytes|postgres|postgrest|pgrst|relation .* does not exist|column .* does not exist|function .* does not exist/i.test(message)?"The ordering service is temporarily unavailable.":message
  const status=known.status??400
  const code=known.code??"ORDER_REQUEST_FAILED"
  reportApiError(Object.assign(new Error(safe),{status,code}),{requestId,route:"/api/v1/orders",branchId})
  return apiError(code,safe,status,undefined,requestId)
}

export async function GET(request: NextRequest) {
  const requestId=apiRequestId(request)
  try {
    const [{snapshot},session]=await Promise.all([requireMobileStorefront(request,{branch:false}),requireBearerSession(request)])
    const limit=listLimit(request),cursor=decodeCursor(request.nextUrl.searchParams.get("cursor"))
    const rows=await listCustomerOrdersPage(session.identity,snapshot.business.id!,limit,cursor)
    const visible=rows.slice(0,limit),tail=visible.at(-1) as {created_at?:string;id?:string}|undefined
    return apiSuccessWithMeta({orders:visible},{nextCursor:rows.length>limit&&tail?.created_at&&tail.id?encodeCursor({createdAt:tail.created_at,id:tail.id}):null},200,requestId)
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
    const {snapshot:storefront}=await requireMobileStorefront(request)
    if(payload.branchId!==storefront.branch.id)throw Object.assign(new Error("The order branch does not match the selected branch."),{status:409,code:"BRANCH_CONTEXT_MISMATCH"})
    const order=await createOrder(payload,storefront,identity??undefined)
    return apiSuccess({order},201,requestId)
  } catch(error){return failure(error,requestId,branchId)}
}
