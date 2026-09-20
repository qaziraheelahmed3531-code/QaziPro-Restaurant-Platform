import type { NextRequest } from "next/server"

import { ApiProblem, apiFailure, apiRequestId, apiSuccess, parseJson, requireBearerSession } from "@/lib/api/v1"
import { requireMobileStorefront } from "@/lib/api/mobile-context"
import { objectBody, stringField } from "@/lib/api/mobile-validation"

export async function GET(request: NextRequest) {
  const requestId=apiRequestId(request)
  try {
    const [{snapshot},session]=await Promise.all([requireMobileStorefront(request,{branch:false}),requireBearerSession(request)])
    const {data,error}=await session.client.from("customer_device_tokens").select("id,device_id,platform,app_version,locale,is_enabled,last_seen_at,created_at").eq("business_id",snapshot.business.id!).eq("customer_id",session.identity.id).order("last_seen_at",{ascending:false}).limit(50)
    if(error)throw error
    return apiSuccess({devices:data??[]},200,requestId)
  } catch(error){return apiFailure(error,requestId,{route:"/api/v1/devices"})}
}

export async function POST(request: NextRequest) {
  const requestId=apiRequestId(request)
  try {
    const [{snapshot},session,raw]=await Promise.all([requireMobileStorefront(request,{branch:false}),requireBearerSession(request),parseJson(request)])
    const body=objectBody(raw)
    const deviceId=stringField(body,"deviceId",{required:true,minimum:8,maximum:200})
    const platform=stringField(body,"platform",{required:true,maximum:10})
    if(platform!=="android"&&platform!=="ios")throw new ApiProblem("VALIDATION_FAILED","platform must be android or ios.",422,{field:"platform"})
    const pushToken=stringField(body,"pushToken",{required:true,minimum:20,maximum:4096})
    const {data,error}=await session.client.rpc("register_customer_device",{p_business_id:snapshot.business.id!,p_device_id:deviceId,p_platform:platform,p_push_token:pushToken,p_app_version:stringField(body,"appVersion",{maximum:40})||null,p_locale:stringField(body,"locale",{maximum:20})||null})
    if(error)throw error
    const device=Array.isArray(data)?data[0]:data
    return apiSuccess({device:device?{id:device.id,device_id:device.device_id,platform:device.platform,app_version:device.app_version,locale:device.locale,is_enabled:device.is_enabled,last_seen_at:device.last_seen_at}:null},200,requestId)
  } catch(error){return apiFailure(error,requestId,{route:"/api/v1/devices"})}
}

export async function DELETE(request: NextRequest) {
  const requestId=apiRequestId(request)
  try {
    const [{snapshot},session]=await Promise.all([requireMobileStorefront(request,{branch:false}),requireBearerSession(request)])
    const deviceId=request.nextUrl.searchParams.get("deviceId")?.trim()??""
    if(deviceId.length<8||deviceId.length>200)throw new ApiProblem("VALIDATION_FAILED","deviceId is invalid.",422,{field:"deviceId"})
    const {data,error}=await session.client.from("customer_device_tokens").delete().eq("business_id",snapshot.business.id!).eq("customer_id",session.identity.id).eq("device_id",deviceId).select("id").maybeSingle()
    if(error)throw error
    if(!data)throw new ApiProblem("DEVICE_NOT_FOUND","Device registration not found.",404)
    return apiSuccess({unregistered:true},200,requestId)
  } catch(error){return apiFailure(error,requestId,{route:"/api/v1/devices"})}
}
