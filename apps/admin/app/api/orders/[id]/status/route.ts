import { NextResponse } from "next/server"
import { nextOrderStatuses, type OrderStatus } from "@italian-pizza/shared"
import { getAdminContext } from "@/lib/auth"
import { deliverOrderConfirmation } from "@/lib/email/deliver-order-confirmation"
import { createClient } from "@/lib/supabase/server"

export async function POST(request:Request,{params}:{params:Promise<{id:string}>}){
  const context=await getAdminContext();if(!context||!(context.role==="OWNER"||context.permissions.includes("orders.manage")))return NextResponse.json({error:"Forbidden"},{status:403})
  const {id}=await params;const body=await request.json().catch(()=>({})) as {status?:OrderStatus};const target=body.status
  if(!target||!(target in nextOrderStatuses))return NextResponse.json({error:"Choose a valid order status."},{status:400})
  const db=await createClient();const select="id,business_id,customer_id,status,order_number,token_number,customer_email,customer_name,service_mode,delivery_address,total,order_items(product_name,quantity,line_total),branches(restaurant_name,name,formatted_address,address,phone)"
  const {data:current,error:readError}=await db.from("orders").select(select).eq("id",id).eq("business_id",context.businessId).single();if(readError||!current)return NextResponse.json({error:"Order could not be found."},{status:404})
  if(current.status!==target&&!nextOrderStatuses[current.status as OrderStatus]?.includes(target))return NextResponse.json({error:"That status change is not allowed."},{status:409})
  if(current.service_mode==="DELIVERY"&&((current.status==="READY"&&target==="OUT_FOR_DELIVERY")||(current.status==="OUT_FOR_DELIVERY"&&target==="DELIVERED"))){const {data:settings}=await db.from("business_operating_settings").select("rider_portal_enabled").eq("business_id",context.businessId).maybeSingle();if(settings?.rider_portal_enabled)return NextResponse.json({error:"Rider Portal is enabled. The assigned rider must complete this delivery step."},{status:409})}
  let order=current
  if(current.status!==target){const {data,error}=await db.from("orders").update({status:target}).eq("id",id).eq("status",current.status).select(select).single();if(error||!data)return NextResponse.json({error:"Order status could not be updated. Refresh and retry."},{status:409});order=data}
  let emailStatus:"NOT_REQUIRED"|"PENDING"|"SENT"|"FAILED"|"SKIPPED"="NOT_REQUIRED"
  if(target==="CONFIRMED")emailStatus=await deliverOrderConfirmation(db,order)
  return NextResponse.json({ok:true,status:target,emailStatus})
}
