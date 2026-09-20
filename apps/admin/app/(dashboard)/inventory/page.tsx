import { InventoryManager } from "@/components/inventory-manager"
import { requirePermission } from "@/lib/auth"
import { getSelectedBranch } from "@/lib/branch"
import { createClient } from "@/lib/supabase/server"
export default async function Page(){const context=await requirePermission("inventory.read");const supabase=await createClient();const branch=await getSelectedBranch(supabase,context.businessId);const {data}=await supabase.from("ingredients").select("id,name,sku,unit,current_stock,minimum_stock,cost_per_unit,is_active,suppliers(name)").eq("business_id",context.businessId).eq("branch_id",branch?.id??"").order("name");return <InventoryManager key={branch?.id??"all"} initialRows={data??[]} canManageIngredients={context.role==="OWNER"||context.permissions.includes("ingredients.manage")} canManage={context.role==="OWNER"||context.permissions.includes("inventory.manage")} branchName={branch?.name??"No branch"}/>}
