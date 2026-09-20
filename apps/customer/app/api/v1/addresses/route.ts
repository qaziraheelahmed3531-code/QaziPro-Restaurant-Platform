import type { NextRequest } from "next/server"

import { apiFailure, apiRequestId, apiSuccess, apiSuccessWithMeta, decodeCursor, encodeCursor, listLimit, parseJson, requireBearerSession } from "@/lib/api/v1"
import { requireMobileStorefront } from "@/lib/api/mobile-context"
import { addressPayload, publicAddress } from "@/lib/api/mobile-addresses"

const select="*,delivery_areas(slug)"

export async function GET(request: NextRequest) {
  const requestId=apiRequestId(request)
  try {
    const [{snapshot},session]=await Promise.all([requireMobileStorefront(request,{branch:false}),requireBearerSession(request)])
    const limit=listLimit(request),cursor=decodeCursor(request.nextUrl.searchParams.get("cursor"))
    let query=session.client.from("customer_addresses").select(select).eq("customer_id",session.identity.id).eq("business_id",snapshot.business.id!).order("created_at",{ascending:false}).order("id",{ascending:false}).limit(limit+1)
    if(cursor)query=query.or(`created_at.lt.${cursor.createdAt},and(created_at.eq.${cursor.createdAt},id.lt.${cursor.id})`)
    const {data,error}=await query
    if(error)throw error
    const rows=data??[],hasMore=rows.length>limit,visible=rows.slice(0,limit)
    const tail=visible.at(-1)
    return apiSuccessWithMeta({addresses:visible.map(row=>publicAddress(row))},{nextCursor:hasMore&&tail?encodeCursor({createdAt:tail.created_at,id:tail.id}):null},200,requestId)
  } catch(error){return apiFailure(error,requestId,{route:"/api/v1/addresses"})}
}
export async function POST(request: NextRequest) {
  const requestId=apiRequestId(request)
  try {
    const [{snapshot},session,raw]=await Promise.all([requireMobileStorefront(request),requireBearerSession(request),parseJson(request)])
    const payload=await addressPayload(raw,snapshot)
    const {data,error}=await session.client.from("customer_addresses").insert({...payload,customer_id:session.identity.id}).select(select).single()
    if(error)throw error
    return apiSuccess({address:publicAddress(data)},201,requestId)
  } catch(error){return apiFailure(error,requestId,{route:"/api/v1/addresses"})}
}
