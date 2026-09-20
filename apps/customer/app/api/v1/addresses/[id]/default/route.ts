import type { NextRequest } from "next/server"

import { apiFailure, apiRequestId, apiSuccess, requireBearerSession } from "@/lib/api/v1"
import { requireMobileStorefront } from "@/lib/api/mobile-context"
import { uuidField } from "@/lib/api/mobile-validation"

type Context={params:Promise<{id:string}>}
export async function POST(request: NextRequest,{params}:Context) {
  const requestId=apiRequestId(request)
  try {
    const id=uuidField((await params).id,"id")
    const [{snapshot},session]=await Promise.all([requireMobileStorefront(request,{branch:false}),requireBearerSession(request)])
    const {error}=await session.client.rpc("set_customer_default_address",{p_business_id:snapshot.business.id!,p_address_id:id})
    if(error)throw error
    return apiSuccess({addressId:id,isDefault:true},200,requestId)
  } catch(error){return apiFailure(error,requestId,{route:"/api/v1/addresses/:id/default"})}
}
