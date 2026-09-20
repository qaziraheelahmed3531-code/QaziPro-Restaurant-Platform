import type { NextRequest } from "next/server"

import { ApiProblem, apiFailure, apiRequestId, apiSuccess, parseJson, requireBearerSession } from "@/lib/api/v1"
import { requireMobileStorefront } from "@/lib/api/mobile-context"
import { addressPayload, publicAddress } from "@/lib/api/mobile-addresses"
import { uuidField } from "@/lib/api/mobile-validation"

type Context={params:Promise<{id:string}>}

export async function PATCH(request: NextRequest,{params}:Context) {
  const requestId=apiRequestId(request)
  try {
    const id=uuidField((await params).id,"id")
    const [{snapshot},session,raw]=await Promise.all([requireMobileStorefront(request),requireBearerSession(request),parseJson(request)])
    const payload=await addressPayload(raw,snapshot,true)
    const {data,error}=await session.client.from("customer_addresses").update(payload).eq("id",id).eq("customer_id",session.identity.id).eq("business_id",snapshot.business.id!).select("*,delivery_areas(slug)").maybeSingle()
    if(error)throw error
    if(!data)throw new ApiProblem("ADDRESS_NOT_FOUND","Address not found.",404)
    return apiSuccess({address:publicAddress(data)},200,requestId)
  } catch(error){return apiFailure(error,requestId,{route:"/api/v1/addresses/:id"})}
}
export async function DELETE(request: NextRequest,{params}:Context) {
  const requestId=apiRequestId(request)
  try {
    const id=uuidField((await params).id,"id")
    const [{snapshot},session]=await Promise.all([requireMobileStorefront(request,{branch:false}),requireBearerSession(request)])
    const {data,error}=await session.client.from("customer_addresses").delete().eq("id",id).eq("customer_id",session.identity.id).eq("business_id",snapshot.business.id!).select("id").maybeSingle()
    if(error)throw error
    if(!data)throw new ApiProblem("ADDRESS_NOT_FOUND","Address not found.",404)
    return apiSuccess({deleted:true},200,requestId)
  } catch(error){return apiFailure(error,requestId,{route:"/api/v1/addresses/:id"})}
}
