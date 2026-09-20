import { createClient } from "@supabase/supabase-js"
import type { NextRequest } from "next/server"

import { ApiProblem, apiFailure, apiRequestId, apiSuccess, consumeRateLimit, parseJson } from "@/lib/api/v1"
import { requireMobileStorefront } from "@/lib/api/mobile-context"
import { objectBody, stringField } from "@/lib/api/mobile-validation"

export async function POST(request: NextRequest) {
  const requestId=apiRequestId(request)
  try {
    const [{snapshot},raw]=await Promise.all([requireMobileStorefront(request,{branch:false}),parseJson(request)])
    if(!await consumeRateLimit(request,"mobile-password-reset",5,900,snapshot.business.id!))throw new ApiProblem("RATE_LIMITED","Too many reset attempts. Try again later.",429)
    const email=stringField(objectBody(raw),"email",{required:true,maximum:254,pattern:/^[^\s@]+@[^\s@]+\.[^\s@]+$/})
    const url=process.env.NEXT_PUBLIC_SUPABASE_URL,key=process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY,redirectTo=process.env.MOBILE_AUTH_CALLBACK_URL
    if(!url||!key||!redirectTo)throw new ApiProblem("AUTH_CALLBACK_UNAVAILABLE","Password reset is not configured for this environment.",503)
    const {error}=await createClient(url,key,{auth:{persistSession:false,autoRefreshToken:false}}).auth.resetPasswordForEmail(email,{redirectTo})
    if(error)console.warn(JSON.stringify({event:"password_reset_provider_rejected",requestId,code:error.code??"unknown"}))
    return apiSuccess({accepted:true,message:"If the account exists, reset instructions will be sent."},202,requestId)
  } catch(error){return apiFailure(error,requestId,{route:"/api/v1/auth/password-reset"})}
}
