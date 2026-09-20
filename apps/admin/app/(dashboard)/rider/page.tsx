import { RiderPortal, type RiderDashboard } from "@/components/rider-portal"
import { getSelectedBranch } from "@/lib/branch"
import { requirePermission } from "@/lib/auth"
import { createClient } from "@/lib/supabase/server"

export default async function Page(){
  const context=await requirePermission("rider.use")
  const db=await createClient()
  const branch=await getSelectedBranch(db,context.businessId,context.assignedBranchId)
  if(!branch)return <div className="state-box">No active restaurant is assigned to this rider.</div>
  const [settings,dashboard,branding]=await Promise.all([
    db.from("business_operating_settings").select("rider_portal_enabled").eq("business_id",context.businessId).maybeSingle(),
    db.rpc("rider_dashboard",{p_branch_id:branch.id}),
    db.from("business_branding").select("logo_url").eq("business_id",context.businessId).maybeSingle(),
  ])
  if(settings.error||dashboard.error)return <div className="state-box">Rider operations are unavailable. Apply the latest database migration and retry.</div>
  return <RiderPortal riderId={context.userId} businessId={context.businessId} branch={branch} logoUrl={branding.data?.logo_url??null} initialDashboard={dashboard.data as RiderDashboard}/>
}
