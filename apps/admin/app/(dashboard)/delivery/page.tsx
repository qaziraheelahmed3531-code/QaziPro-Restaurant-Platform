import { ResourceScreen } from "@/components/resource-screen"
import { DeliverySetupWizard } from "@/components/delivery-setup-wizard"
import { requirePermission } from "@/lib/auth"
import { getSelectedBranch } from "@/lib/branch"
import { createClient } from "@/lib/supabase/server"

export default async function Page(){
  const context = await requirePermission("delivery.manage")
  const branch = await getSelectedBranch(await createClient(), context.businessId, context.assignedBranchId)
  if(!branch)return <section className="panel"><h2>Select an operational branch</h2><p>“All branches” is for reports only. Choose a real branch above before editing restaurant location, fees or delivery areas.</p></section>
  return <><DeliverySetupWizard businessId={context.businessId} branchId={branch?.id}/><div style={{height:32}}/><ResourceScreen resource="deliveryRules"/><div style={{height:32}}/><ResourceScreen resource="areas"/></>
}
