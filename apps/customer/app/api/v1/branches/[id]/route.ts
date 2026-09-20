import type { NextRequest } from "next/server"

import { ApiProblem, apiFailure, apiRequestId, apiSuccess } from "@/lib/api/v1"
import { resolveMobileBootstrap } from "@/lib/api/mobile-context"
import { uuidField } from "@/lib/api/mobile-validation"

type Context={params:Promise<{id:string}>}
export async function GET(request: NextRequest,{params}:Context) {
  const requestId=apiRequestId(request)
  try {
    const id=uuidField((await params).id,"id"),bootstrap=await resolveMobileBootstrap(request)
    const branch=bootstrap.branches.find(item=>item.id===id)
    if(!branch)throw new ApiProblem("BRANCH_NOT_FOUND","The branch is unavailable for this restaurant.",404)
    return apiSuccess({branch,selection:{header:"x-qazipro-branch-id",value:branch.id}},200,requestId)
  } catch(error){return apiFailure(error,requestId,{route:"/api/v1/branches/:id"})}
}
