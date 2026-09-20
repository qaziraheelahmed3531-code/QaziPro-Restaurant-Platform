import type { NextRequest } from "next/server"

import { ApiProblem, apiFailure, apiRequestId, apiSuccess, apiSuccessWithMeta, decodeCursor, encodeCursor, listLimit, parseJson, requireBearerSession } from "@/lib/api/v1"
import { requireMobileStorefront } from "@/lib/api/mobile-context"
import { objectBody, uuidField } from "@/lib/api/mobile-validation"

export async function GET(request: NextRequest) {
  const requestId=apiRequestId(request)
  try {
    const [{snapshot},session]=await Promise.all([requireMobileStorefront(request,{branch:false}),requireBearerSession(request)])
    const limit=listLimit(request),cursor=decodeCursor(request.nextUrl.searchParams.get("cursor"))
    let query=session.client.from("customer_favourites").select("id,product_id,created_at,products(id,name,base_price,sale_price,is_available)").eq("user_id",session.identity.id).eq("business_id",snapshot.business.id!).order("created_at",{ascending:false}).order("id",{ascending:false}).limit(limit+1)
    if(cursor)query=query.or(`created_at.lt.${cursor.createdAt},and(created_at.eq.${cursor.createdAt},id.lt.${cursor.id})`)
    const {data,error}=await query
    if(error)throw error
    const rows=data??[],visible=rows.slice(0,limit),tail=visible.at(-1)
    return apiSuccessWithMeta({favourites:visible},{nextCursor:rows.length>limit&&tail?encodeCursor({createdAt:tail.created_at,id:tail.id}):null},200,requestId)
  } catch(error){return apiFailure(error,requestId,{route:"/api/v1/favourites"})}
}
export async function POST(request: NextRequest) {
  const requestId=apiRequestId(request)
  try {
    const [{snapshot},session,raw]=await Promise.all([requireMobileStorefront(request,{branch:false}),requireBearerSession(request),parseJson(request)])
    const productId=uuidField(objectBody(raw).productId,"productId")
    const {data:product,error:productError}=await session.client.from("products").select("id").eq("id",productId).eq("business_id",snapshot.business.id!).eq("is_active",true).maybeSingle()
    if(productError)throw productError
    if(!product)throw new ApiProblem("PRODUCT_NOT_FOUND","Product is unavailable.",404)
    const {data,error}=await session.client.from("customer_favourites").upsert({user_id:session.identity.id,business_id:snapshot.business.id!,product_id:productId},{onConflict:"user_id,product_id"}).select("id,product_id,created_at").single()
    if(error)throw error
    return apiSuccess({favourite:data},201,requestId)
  } catch(error){return apiFailure(error,requestId,{route:"/api/v1/favourites"})}
}

export async function DELETE(request: NextRequest) {
  const requestId=apiRequestId(request)
  try {
    const [{snapshot},session]=await Promise.all([requireMobileStorefront(request,{branch:false}),requireBearerSession(request)])
    const productId=uuidField(request.nextUrl.searchParams.get("productId"),"productId")
    const {data,error}=await session.client.from("customer_favourites").delete().eq("user_id",session.identity.id).eq("business_id",snapshot.business.id!).eq("product_id",productId).select("id").maybeSingle()
    if(error)throw error
    if(!data)throw new ApiProblem("FAVOURITE_NOT_FOUND","Favourite not found.",404)
    return apiSuccess({deleted:true},200,requestId)
  } catch(error){return apiFailure(error,requestId,{route:"/api/v1/favourites"})}
}
