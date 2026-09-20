import { MonitorDown } from "lucide-react"
import { DesktopPosDevices } from "@/components/desktop-pos-devices"
import { requirePermission } from "@/lib/auth"
import { createClient } from "@/lib/supabase/server"

export default async function DesktopPosPage(){
  const context=await requirePermission("desktop_pos.use");const supabase=await createClient()
  const {data,error}=await supabase.from("pos_offline_devices").select("id,device_name,app_version,is_active,last_catalog_at,last_sync_at,created_at,branches(name,restaurant_name,city)").eq("business_id",context.businessId).order("created_at",{ascending:false})
  const canManage=context.role==="OWNER"||context.permissions.includes("settings.manage")
  return <><div className="page-heading"><div><span className="eyebrow">ONLINE + OFFLINE COUNTER</span><h1>QaziPRO POS Desktop</h1><p>Manage Windows counter installations, live website orders and offline sales that reconcile automatically after reconnect.</p></div><MonitorDown/></div>{error&&<p className="inline-notice is-error" role="alert">{error.message}</p>}<DesktopPosDevices initialDevices={(data??[]) as never} canManage={canManage}/></>
}
