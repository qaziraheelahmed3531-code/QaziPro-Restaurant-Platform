import type { NextRequest } from "next/server"

import { apiFailure, apiRequestId, apiSuccess } from "@/lib/api/v1"
import { resolveMobileBootstrap } from "@/lib/api/mobile-context"

export async function GET(request: NextRequest) {
  const requestId=apiRequestId(request)
  try {
    const bootstrap=await resolveMobileBootstrap(request)
    return apiSuccess({branches:bootstrap.branches},200,requestId)
  } catch(error){return apiFailure(error,requestId,{route:"/api/v1/branches"})}
}
