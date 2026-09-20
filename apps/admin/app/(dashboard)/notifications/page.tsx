import { NotificationsCenter } from "@/components/notifications-center"
import { requirePermission } from "@/lib/auth"
import { createClient } from "@/lib/supabase/server"
export default async function Page(){const context=await requirePermission("notifications.read");const {data}=await (await createClient()).from("notifications").select("id,notification_type,title,message,entity_type,entity_id,is_read,created_at").eq("business_id",context.businessId).is("resolved_at",null).order("is_read",{ascending:true}).order("created_at",{ascending:false}).limit(100);return <NotificationsCenter businessId={context.businessId} initialRows={data??[]}/>}
