import { NextRequest, NextResponse } from "next/server"
import { parseBrowserSubscription } from "@italian-pizza/shared/web-push"
import { getStorefrontSnapshot } from "@/lib/storefront/server"
import { createClient } from "@/lib/supabase/server"
import { createAdminClient } from "@/lib/supabase/admin"
import { consumeRateLimit } from "@/lib/api/v1"

const json = (data: unknown, status=200) => NextResponse.json(data,{status,headers:{"Cache-Control":"private, no-store"}})
export async function GET() {
  const key=process.env.WEB_PUSH_PUBLIC_KEY
  return json({ configured:Boolean(key && /^[A-Za-z0-9_-]{87}$/.test(key)),publicKey:key && /^[A-Za-z0-9_-]{87}$/.test(key)?key:null })
}
async function mutate(request: NextRequest, removing: boolean) {
  if (request.headers.get("origin")!==request.nextUrl.origin) return json({error:"Invalid request origin."},403)
  try {
    const raw=await request.text()
    if(raw.length>6000)return json({error:"Request too large."},413)
    const body=JSON.parse(raw) as {deviceId?:unknown;subscription?:unknown;marketing?:unknown}
    if(typeof body.deviceId!=="string" || !/^[a-zA-Z0-9-]{8,100}$/.test(body.deviceId)) return json({error:"Invalid browser registration."},400)
    const [storefront,session]=await Promise.all([getStorefrontSnapshot(),createClient()])
    const {data:{user}}=await session.auth.getUser()
    if(!user)return json({error:"Sign in to manage private order notifications."},401)
    if(!storefront.business.id || !storefront.branch.id || storefront.orderPersistence!=="database")return json({error:"Restaurant unavailable."},404)
    const db=createAdminClient()
    if(removing) {
      const {error}=await db.from("customer_device_tokens").delete().eq("business_id",storefront.business.id).eq("customer_id",user.id).eq("device_id",body.deviceId).eq("platform","web")
      if(error)throw error
      return json({unsubscribed:true})
    }
    if(!await consumeRateLimit(request,"browser-push",12,60,user.id))return json({error:"Please wait before retrying."},429)
    const subscription=parseBrowserSubscription(body.subscription)
    if(!subscription)return json({error:"This browser subscription is not supported."},400)
    if(!process.env.WEB_PUSH_PUBLIC_KEY)return json({error:"Notifications are not configured yet."},503)
    const {error}=await db.rpc("register_browser_device",{p_business_id:storefront.business.id,p_branch_id:storefront.branch.id,p_customer_id:user.id,p_device_id:body.deviceId,p_subscription:subscription,p_origin:request.nextUrl.origin,p_marketing:body.marketing===true})
    if(error)throw error
    return json({subscribed:true})
  } catch { return json({error:"Notification settings could not be saved. Please retry."},503) }
}
export const POST=(request:NextRequest)=>mutate(request,false)
export const DELETE=(request:NextRequest)=>mutate(request,true)
