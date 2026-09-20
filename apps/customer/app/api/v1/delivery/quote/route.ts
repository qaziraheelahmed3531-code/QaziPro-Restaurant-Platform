import type { NextRequest } from "next/server"

import { ApiProblem, apiFailure, apiRequestId, apiSuccess } from "@/lib/api/v1"
import { requireMobileStorefront } from "@/lib/api/mobile-context"
import { calculateDeliveryFee } from "@/lib/delivery-fee"
import { GeoapifyServiceError, isCoordinate } from "@/lib/geoapify/client"
import { getDrivingRoute } from "@/lib/geoapify/routing"
import { validateDeliveryPoint, validateRouteDistance } from "@/lib/location/validate-delivery"

export async function GET(request: NextRequest) {
  const requestId=apiRequestId(request)
  try {
    const latitude=Number(request.nextUrl.searchParams.get("latitude")),longitude=Number(request.nextUrl.searchParams.get("longitude"))
    if(!isCoordinate(latitude,-90,90)||!isCoordinate(longitude,-180,180))throw new ApiProblem("VALIDATION_FAILED","Valid latitude and longitude are required.",422)
    const {snapshot}=await requireMobileStorefront(request)
    let area: Awaited<ReturnType<typeof validateDeliveryPoint>>
    try { area=await validateDeliveryPoint({latitude,longitude},snapshot,request.nextUrl.searchParams.get("areaId")??undefined) }
    catch(error){throw new ApiProblem("DELIVERY_LOCATION_INVALID",error instanceof Error?error.message:"Delivery location is invalid.",422)}
    if(snapshot.branch.originLatitude===null||snapshot.branch.originLongitude===null)throw new ApiProblem("DELIVERY_ORIGIN_UNAVAILABLE","Delivery routing is not configured.",503)
    const route=await getDrivingRoute(latitude,longitude,{latitude:snapshot.branch.originLatitude,longitude:snapshot.branch.originLongitude})
    try { validateRouteDistance(route.distanceKm,snapshot) }
    catch(error){throw new ApiProblem("DELIVERY_DISTANCE_EXCEEDED",error instanceof Error?error.message:"Delivery distance is invalid.",422)}
    const fee=calculateDeliveryFee(route.distanceKm,snapshot.branch.freeDistanceKm,snapshot.branch.extraKmRate)
    if(fee===null)throw new ApiProblem("DELIVERY_QUOTE_FAILED","Delivery could not be quoted.",502)
    return apiSuccess({eligible:true,deliveryAreaId:area.databaseId,distanceKm:route.distanceKm,estimatedDurationMinutes:route.estimatedDurationMinutes,deliveryFee:fee,currency:snapshot.business.currency,authoritativeAtCheckout:true},200,requestId)
  } catch(error){if(error instanceof GeoapifyServiceError)error=new ApiProblem("LOCATION_PROVIDER_UNAVAILABLE","Delivery routing is unavailable.",error.code==="not-configured"?503:502);return apiFailure(error,requestId,{route:"/api/v1/delivery/quote"})}
}
