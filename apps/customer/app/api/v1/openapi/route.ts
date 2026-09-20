import type { NextRequest } from "next/server"

import { apiRequestId } from "@/lib/api/v1"
import { mobileOpenApi } from "@/lib/api/openapi"
import { NextResponse } from "next/server"

export async function GET(request: NextRequest) {
  const requestId=apiRequestId(request)
  return NextResponse.json(mobileOpenApi,{headers:{"Cache-Control":"public, max-age=300","x-request-id":requestId}})
}
