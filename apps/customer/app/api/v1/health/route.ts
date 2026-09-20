import { NextRequest } from "next/server"

import { apiError, apiRequestId, apiSuccess, reportApiError } from "@/lib/api/v1"
import { createAdminClient } from "@/lib/supabase/admin"

export const dynamic = "force-dynamic"

export async function GET(request: NextRequest) {
  const requestId=apiRequestId(request)
  const configured=Boolean(process.env.NEXT_PUBLIC_SUPABASE_URL&&process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY&&process.env.SUPABASE_SERVICE_ROLE_KEY)
  if(!configured)return apiError("CONFIGURATION_MISSING","Required server configuration is unavailable.",503,{dependencies:{configuration:"fail",database:"not_checked"}},requestId)
  try {
    const { error }=await createAdminClient().from("businesses").select("id",{head:true,count:"exact"}).limit(1)
    if(error)throw error
    return apiSuccess({status:"ok",service:"customer-api",environment:process.env.APP_ENVIRONMENT??process.env.NODE_ENV??"unknown",timestamp:new Date().toISOString(),dependencies:{configuration:"ok",database:"ok"}},200,requestId)
  } catch(error) {
    reportApiError(error,{requestId,route:"/api/v1/health"})
    return apiError("DATABASE_UNAVAILABLE","Database health check failed.",503,{dependencies:{configuration:"ok",database:"fail"}},requestId)
  }
}
