import type { NextRequest } from "next/server"

import { ApiProblem, apiFailure, apiRequestId, apiSuccess } from "@/lib/api/v1"
import { requireMobileStorefront } from "@/lib/api/mobile-context"
import { GeoapifyServiceError, isCoordinate } from "@/lib/geoapify/client"
import { resolveDeliveryAddress } from "@/lib/location/resolve-address"

export async function GET(request: NextRequest) {
  const requestId=apiRequestId(request)
  try {
    const latitude=Number(request.nextUrl.searchParams.get("latitude")),longitude=Number(request.nextUrl.searchParams.get("longitude"))
    if(!isCoordinate(latitude,-90,90)||!isCoordinate(longitude,-180,180))throw new ApiProblem("VALIDATION_FAILED","Valid latitude and longitude are required.",422)
    const {snapshot}=await requireMobileStorefront(request)
    return apiSuccess(await resolveDeliveryAddress(latitude,longitude,snapshot.deliveryAreas),200,requestId)
  } catch(error){if(error instanceof GeoapifyServiceError)error=new ApiProblem("LOCATION_PROVIDER_UNAVAILABLE","Reverse geocoding is unavailable.",error.code==="not-configured"?503:502);return apiFailure(error,requestId,{route:"/api/v1/location/reverse"})}
}
