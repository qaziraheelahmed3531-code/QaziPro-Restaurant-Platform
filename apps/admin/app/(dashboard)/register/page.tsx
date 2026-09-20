import { RegisterManager } from "@/components/register-manager"
import { requirePermission } from "@/lib/auth"
import { getSelectedBranch } from "@/lib/branch"
import { createClient } from "@/lib/supabase/server"

export default async function Page(){const context=await requirePermission("register.manage");const supabase=await createClient();const branch=await getSelectedBranch(supabase,context.businessId);if(!branch)return <div className="state-box">Configure an active branch first.</div>;const [current,history]=await Promise.all([supabase.from("register_shifts").select("*").eq("business_id",context.businessId).eq("branch_id",branch.id).eq("opened_by",context.userId).eq("status","OPEN").limit(1).maybeSingle(),supabase.from("register_shifts").select("*").eq("business_id",context.businessId).eq("branch_id",branch.id).order("opened_at",{ascending:false}).limit(20)]);return <RegisterManager key={branch.id} branch={branch} current={current.data} initialHistory={history.data??[]}/>}
