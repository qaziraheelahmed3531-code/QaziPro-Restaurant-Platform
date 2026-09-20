import type { NextRequest } from "next/server"

import { apiFailure, apiRequestId, apiSuccess, parseJson, requireBearerSession } from "@/lib/api/v1"
import { requireMobileStorefront } from "@/lib/api/mobile-context"
import { objectBody, stringField } from "@/lib/api/mobile-validation"
import { assertCustomerIdentityAllowed } from "@/lib/restrictions/server"

const fields="id,full_name,phone,avatar_url,gender,date_of_birth"

export async function GET(request: NextRequest) {
  const requestId=apiRequestId(request)
  try {
    const [{snapshot},session]=await Promise.all([requireMobileStorefront(request,{branch:false}),requireBearerSession(request)])
    await assertCustomerIdentityAllowed(snapshot.business.id!,session.identity,"access")
    const {data,error}=await session.client.from("profiles").select(fields).eq("id",session.identity.id).maybeSingle()
    if(error)throw error
    return apiSuccess({profile:data??{id:session.identity.id,full_name:null,phone:null,avatar_url:null,gender:null,date_of_birth:null},email:session.identity.email},200,requestId)
  } catch(error){return apiFailure(error,requestId,{route:"/api/v1/profile"})}
}
export async function PATCH(request: NextRequest) {
  const requestId=apiRequestId(request)
  try {
    const [{snapshot},session,raw]=await Promise.all([requireMobileStorefront(request,{branch:false}),requireBearerSession(request),parseJson(request)])
    await assertCustomerIdentityAllowed(snapshot.business.id!,session.identity,"access")
    const body=objectBody(raw)
    const fullName=stringField(body,"fullName",{maximum:120})||null
    const phone=stringField(body,"phone",{maximum:40})||null
    const gender=stringField(body,"gender",{maximum:30})||null
    const dateOfBirth=stringField(body,"dateOfBirth",{maximum:10,pattern:/^\d{4}-\d{2}-\d{2}$/})||null
    const {data,error}=await session.client.from("profiles").upsert({id:session.identity.id,full_name:fullName,phone,gender,date_of_birth:dateOfBirth},{onConflict:"id"}).select(fields).single()
    if(error)throw error
    return apiSuccess({profile:data},200,requestId)
  } catch(error){return apiFailure(error,requestId,{route:"/api/v1/profile"})}
}
