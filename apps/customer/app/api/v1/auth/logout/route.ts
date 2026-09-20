import type { NextRequest } from "next/server"

import { ApiProblem, apiFailure, apiRequestId, apiSuccess, requireBearerSession } from "@/lib/api/v1"
import { requireMobileStorefront } from "@/lib/api/mobile-context"
import { createAdminClient } from "@/lib/supabase/admin"

export async function POST(request: NextRequest) {
  const requestId=apiRequestId(request)
  try {
    const [,session]=await Promise.all([requireMobileStorefront(request,{branch:false}),requireBearerSession(request)])
    const {error}=await createAdminClient().auth.admin.signOut(session.token,"global")
    if(error)throw new ApiProblem("LOGOUT_FAILED","The session could not be revoked.",503)
    return apiSuccess({loggedOut:true},200,requestId)
  } catch(error){return apiFailure(error,requestId,{route:"/api/v1/auth/logout"})}
}
