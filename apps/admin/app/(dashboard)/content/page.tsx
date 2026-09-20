import { ResourceScreen } from "@/components/resource-screen"
import { SocialEditor } from "@/components/social-editor"
import { WhatsAppFloatingEditor } from "@/components/whatsapp-floating-editor"
import { CustomerBroadcastManager } from "@/components/customer-broadcast-manager"
import { requireAdmin, requirePermission } from "@/lib/auth"
import { createClient } from "@/lib/supabase/server"
export default async function Page(){
 const context=await requireAdmin()
 const content=context.role==="OWNER"||context.permissions.includes("content.manage")
 const social=context.role==="OWNER"||context.permissions.includes("social.manage")
 if(!content&&!social)await requirePermission("content.manage")
 const db=content?await createClient():null
 const [deals,campaigns]=db?await Promise.all([
  db.from("deals").select("id,name,deal_price").eq("business_id",context.businessId).eq("is_active",true).order("sort_order"),
  db.from("customer_broadcasts").select("id,subject,status,recipient_count,sent_count,failed_count,created_at").eq("business_id",context.businessId).order("created_at",{ascending:false}).limit(20),
 ]):[{data:[]},{data:[]}]
 return <>
  {content&&<ResourceScreen resource="settings"/>}
  {content&&<><div className="section-gap"/><ResourceScreen resource="footerLinks"/><div className="section-gap"/><ResourceScreen resource="contentPages"/></>}
  {social&&<><div className="section-gap"/><SocialEditor businessId={context.businessId}/></>}
  {content&&<><div className="section-gap"/><WhatsAppFloatingEditor businessId={context.businessId}/><div className="section-gap"/><CustomerBroadcastManager deals={(deals.data??[]) as never} initialCampaigns={(campaigns.data??[]) as never}/></>}
 </>
}
