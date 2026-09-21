import { HoursEditor } from "@/components/hours-editor"
import { requirePermission } from "@/lib/auth"
import { getSelectedBranch } from "@/lib/branch"
import { createClient } from "@/lib/supabase/server"

export default async function Page() {
  const context = await requirePermission("settings.manage")
  const supabase = await createClient()
  const branch = await getSelectedBranch(supabase, context.businessId, context.assignedBranchId)
  if (!branch) return <div className="state-box">Select an active branch to edit opening hours.</div>
  const { data } = await supabase.from("business_hours").select("id,branch_id,day_of_week,opens_at,closes_at,is_closed").eq("branch_id", branch.id).order("day_of_week")
  return <><div className="page-heading"><div><span className="eyebrow">DELIVERY OPERATIONS</span><h1>Opening hours</h1><p>Set a clear weekly schedule for {branch.name}. Temporary closure remains available in Branches.</p></div></div><HoursEditor branchId={branch.id} timezone={branch.timezone || "Asia/Karachi"} initial={(data ?? []) as never[]} /></>
}
