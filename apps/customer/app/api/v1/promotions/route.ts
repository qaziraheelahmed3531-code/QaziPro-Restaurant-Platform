import type { NextRequest } from "next/server"

import { apiFailure, apiRequestId, apiSuccess } from "@/lib/api/v1"
import { requireMobileStorefront } from "@/lib/api/mobile-context"
import { createAdminClient } from "@/lib/supabase/admin"

export async function GET(request: NextRequest) {
  const requestId=apiRequestId(request)
  try {
    const {snapshot}=await requireMobileStorefront(request,{branch:false})
    const now=new Date().toISOString()
    const {data,error}=await createAdminClient().from("promotions").select("code,discount_type,discount_value,maximum_discount,starts_at,ends_at").eq("business_id",snapshot.business.id!).eq("is_active",true).or(`starts_at.is.null,starts_at.lte.${now}`).or(`ends_at.is.null,ends_at.gt.${now}`).order("created_at",{ascending:false}).limit(100)
    if(error)throw error
    return apiSuccess({promotions:(data??[]).map(item=>({code:item.code,type:item.discount_type,value:item.discount_value,maximumDiscount:item.maximum_discount,startsAt:item.starts_at,endsAt:item.ends_at})),currency:snapshot.business.currency},200,requestId)
  } catch(error){return apiFailure(error,requestId,{route:"/api/v1/promotions"})}
}
