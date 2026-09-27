import { TableManager } from "@/components/table-manager"
import { requirePermission } from "@/lib/auth"
import { getSelectedBranch } from "@/lib/branch"
import { createClient } from "@/lib/supabase/server"

export default async function Page(){
  const context=await requirePermission("settings.manage"),supabase=await createClient()
  const branch=await getSelectedBranch(supabase,context.businessId,context.assignedBranchId)
  if(!branch)return <div className="state-box">Select an active branch before managing tables.</div>
  const {data,error}=await supabase.from("restaurant_tables").select("id,code,name,seats,is_active").eq("business_id",context.businessId).eq("branch_id",branch.id).order("name")
  return <TableManager key={`${context.businessId}:${branch.id}`} businessId={context.businessId} branchId={branch.id} initialTables={data??[]} loadError={Boolean(error)}/>
}
