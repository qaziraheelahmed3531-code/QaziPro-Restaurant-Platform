import { ResourceScreen } from "@/components/resource-screen"
import { DeliverySetupWizard } from "@/components/delivery-setup-wizard"
import { requirePermission } from "@/lib/auth"
import { getSelectedBranch } from "@/lib/branch"
import { createClient } from "@/lib/supabase/server"
export default async function Page(){
  const context=await requirePermission("branches.manage")
  const branch=await getSelectedBranch(await createClient(),context.businessId,context.assignedBranchId)
  return <><ResourceScreen resource="branches"/><DeliverySetupWizard businessId={context.businessId} branchId={branch?.id} locationOnly/></>
}
