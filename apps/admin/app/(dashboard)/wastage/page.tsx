import { WastageManager } from "@/components/wastage-manager"
import { requirePermission } from "@/lib/auth"
import { getSelectedBranch } from "@/lib/branch"
import { createClient } from "@/lib/supabase/server"
export default async function Page(){const context=await requirePermission("wastage.manage");const supabase=await createClient();const branch=await getSelectedBranch(supabase,context.businessId);const [ingredients,wastage]=await Promise.all([supabase.from("ingredients").select("id,name,unit,current_stock").eq("business_id",context.businessId).eq("branch_id",branch?.id??"").eq("is_active",true).order("name"),supabase.from("wastage").select("id,quantity,reason,notes,created_at,ingredients(name,unit)").eq("business_id",context.businessId).eq("branch_id",branch?.id??"").order("created_at",{ascending:false}).limit(100)]);return <WastageManager ingredients={ingredients.data??[]} initialRows={wastage.data??[]} branchName={branch?.name??"No branch"}/>}
