import type { NextRequest } from "next/server"

import { apiFailure, apiRequestId, apiSuccess } from "@/lib/api/v1"
import { resolveMobileBootstrap } from "@/lib/api/mobile-context"

export async function GET(request: NextRequest) {
  const requestId=apiRequestId(request)
  try { return apiSuccess(await resolveMobileBootstrap(request),200,requestId) }
  catch(error){return apiFailure(error,requestId,{route:"/api/v1/bootstrap"})}
}
