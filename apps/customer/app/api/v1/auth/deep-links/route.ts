import type { NextRequest } from "next/server"

import { apiFailure, apiRequestId, apiSuccess } from "@/lib/api/v1"
import { requireMobileStorefront } from "@/lib/api/mobile-context"

export async function GET(request: NextRequest) {
  const requestId=apiRequestId(request)
  try {
    const {snapshot}=await requireMobileStorefront(request,{branch:false})
    const webBase=process.env.MOBILE_WEB_BASE_URL?.replace(/\/$/,"")||request.nextUrl.origin
    return apiSuccess({
      restaurantKey:snapshot.business.slug,
      callbacks:{web:`${webBase}/auth/callback`,native:process.env.MOBILE_AUTH_CALLBACK_URL??null},
      routes:{verifyEmail:"auth/callback?type=signup",passwordReset:"auth/callback?type=recovery",order:"orders/{orderNumber}"},
      nativeBundleIdentifiersConfigured:false,
    },200,requestId)
  } catch(error){return apiFailure(error,requestId,{route:"/api/v1/auth/deep-links"})}
}
