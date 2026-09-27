import { NextResponse } from "next/server"
import { getAdminContext } from "@/lib/auth"
import { getSelectedBranch } from "@/lib/branch"
import { createClient } from "@/lib/supabase/server"
import { resolveCustomerOrigin } from "@/lib/customer-origin"
import { safeNotificationPath } from "@italian-pizza/shared/web-push"

export async function POST(request:Request){
  const context=await getAdminContext()
  if(!context || !context.permissions.includes("content.manage") && context.role!=="OWNER")return NextResponse.json({error:"Messaging access denied."},{status:403})
  try{
    const raw=await request.text();if(raw.length>4000)return NextResponse.json({error:"Draft too large."},{status:413})
    const body=JSON.parse(raw) as {title?:unknown;message?:unknown;path?:unknown;requestId?:unknown}
    const path=safeNotificationPath(body.path)
    if(typeof body.title!=="string" || body.title.trim().length<3 || body.title.length>140 || typeof body.message!=="string" || body.message.trim().length<3 || body.message.length>500 || !path || typeof body.requestId!=="string" || !/^[a-f0-9-]{36}$/i.test(body.requestId))return NextResponse.json({error:"Check the title, message and destination."},{status:400})
    const db=await createClient()
    const branch=await getSelectedBranch(db,context.businessId,context.assignedBranchId)
    if(!branch)return NextResponse.json({error:"Select an assigned branch before sending."},{status:400})
    await resolveCustomerOrigin(db,context.businessId)
    const {data,error}=await db.rpc("create_customer_push_broadcast",{p_business_id:context.businessId,p_branch_id:branch.id,p_title:body.title.trim(),p_message:body.message.trim(),p_path:path,p_request_id:body.requestId})
    if(error)return NextResponse.json({error:"The notification could not be queued. Retry the unchanged draft."},{status:409})
    return NextResponse.json(data,{status:201,headers:{"Cache-Control":"private, no-store"}})
  }catch{return NextResponse.json({error:"The notification service is unavailable. Your draft has not been cleared."},{status:503})}
}
