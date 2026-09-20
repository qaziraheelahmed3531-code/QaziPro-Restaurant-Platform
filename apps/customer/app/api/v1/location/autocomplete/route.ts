import type { NextRequest } from "next/server"

import { ApiProblem, apiFailure, apiRequestId, apiSuccess } from "@/lib/api/v1"
import { requireMobileStorefront } from "@/lib/api/mobile-context"
import { autocompleteAddress } from "@/lib/geoapify/autocomplete"
import { GeoapifyServiceError } from "@/lib/geoapify/client"

export async function GET(request: NextRequest) {
  const requestId=apiRequestId(request)
  try {
    const query=request.nextUrl.searchParams.get("q")?.trim()??""
    if(query.length<3||query.length>160)throw new ApiProblem("VALIDATION_FAILED","q must contain 3 to 160 characters.",422,{field:"q"})
    const {snapshot}=await requireMobileStorefront(request)
    const area=snapshot.deliveryAreas.find(item=>item.id===request.nextUrl.searchParams.get("areaId")||item.databaseId===request.nextUrl.searchParams.get("areaId"))
    const origin=area?.centerLatitude!=null&&area.centerLongitude!=null?{latitude:area.centerLatitude,longitude:area.centerLongitude}:snapshot.branch.originLatitude!==null&&snapshot.branch.originLongitude!==null?{latitude:snapshot.branch.originLatitude,longitude:snapshot.branch.originLongitude}:undefined
    return apiSuccess({suggestions:await autocompleteAddress(query,area?`${area.label}, ${snapshot.branch.city}`:snapshot.branch.city,origin)},200,requestId)
  } catch(error){if(error instanceof GeoapifyServiceError)error=new ApiProblem("LOCATION_PROVIDER_UNAVAILABLE","Address suggestions are unavailable.",error.code==="not-configured"?503:502);return apiFailure(error,requestId,{route:"/api/v1/location/autocomplete"})}
}
