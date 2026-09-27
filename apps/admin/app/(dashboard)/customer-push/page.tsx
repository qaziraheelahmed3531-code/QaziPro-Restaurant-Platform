import { requirePermission } from "@/lib/auth"
import { getSelectedBranch } from "@/lib/branch"
import { createClient } from "@/lib/supabase/server"
import { CustomerPushManager } from "@/components/customer-push-manager"

export default async function Page(){
  const context=await requirePermission("content.manage"),db=await createClient()
  const branch=await getSelectedBranch(db,context.businessId,context.assignedBranchId)
  if(!branch)return <div className="state-box">Select an assigned branch to manage browser notifications.</div>
  const {data,error}=await db.from("customer_broadcasts").select("id,subject,status,recipient_count,sent_count,failed_count").eq("business_id",context.businessId).eq("branch_id",branch.id).eq("channel","WEB_PUSH").order("created_at",{ascending:false}).limit(30)
  if(error)return <div className="state-box" role="alert">Notification history could not be loaded. Refresh to retry.</div>
  return <CustomerPushManager key={branch.id} branchName={branch.name} campaigns={data??[]}/>
}
