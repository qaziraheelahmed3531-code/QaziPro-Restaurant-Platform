import type { NextRequest } from "next/server"

import { ApiProblem, apiFailure, apiRequestId, apiSuccess, consumeRateLimit, parseJson } from "@/lib/api/v1"
import { requireMobileStorefront } from "@/lib/api/mobile-context"
import { numberField, objectBody, stringField } from "@/lib/api/mobile-validation"
import { createAdminClient } from "@/lib/supabase/admin"

export async function POST(request: NextRequest) {
  const requestId=apiRequestId(request)
  try {
    const [{snapshot},raw]=await Promise.all([requireMobileStorefront(request),parseJson(request)])
    if(!await consumeRateLimit(request,"promotion-validate",30,60,snapshot.business.id!))throw new ApiProblem("RATE_LIMITED","Too many coupon attempts.",429)
    const body=objectBody(raw),code=stringField(body,"code",{required:true,maximum:40}).toUpperCase(),subtotal=numberField(body,"subtotal",0,100_000_000,false)
    const {data,error}=await createAdminClient().from("promotions").select("discount_type,discount_value,maximum_discount,starts_at,ends_at").eq("business_id",snapshot.business.id!).eq("code",code).eq("is_active",true).limit(1).maybeSingle()
    if(error)throw error
    const now=Date.now(),valid=Boolean(data&&(!data.starts_at||Date.parse(data.starts_at)<=now)&&(!data.ends_at||Date.parse(data.ends_at)>now))
    let estimatedDiscount:number|null=null
    if(valid&&subtotal!==null){estimatedDiscount=data!.discount_type==="PERCENT"?Math.floor(subtotal*Number(data!.discount_value)/100):Number(data!.discount_value);if(data!.maximum_discount!==null)estimatedDiscount=Math.min(estimatedDiscount,Number(data!.maximum_discount));estimatedDiscount=Math.max(0,Math.min(subtotal,estimatedDiscount))}
    return apiSuccess({valid,code,estimatedDiscount,currency:snapshot.business.currency,authoritativeAtCheckout:true},200,requestId)
  } catch(error){return apiFailure(error,requestId,{route:"/api/v1/promotions/validate"})}
}
