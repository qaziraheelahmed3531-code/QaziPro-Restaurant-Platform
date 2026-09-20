import { BranchCatalogManager } from "@/components/branch-catalog-manager"
import { requirePermission } from "@/lib/auth"
import { getSelectedBranch } from "@/lib/branch"
import { createClient } from "@/lib/supabase/server"

export default async function Page(){
  const context=await requirePermission("products.manage")
  const db=await createClient()
  const branch=await getSelectedBranch(db,context.businessId,context.assignedBranchId)
  if(!branch)return <section className="panel"><h2>Select an operational branch</h2><p>Choose a branch above before editing its catalog overrides.</p></section>
  const [products,overrides]=await Promise.all([db.from("products").select("id,name,sku,base_price,sale_price,is_available").eq("business_id",context.businessId).eq("is_active",true).order("sort_order"),db.from("branch_product_overrides").select("product_id,is_available,price_override,pos_visible,online_visible,stock_available,sort_order").eq("business_id",context.businessId).eq("branch_id",branch.id)])
  const byProduct=new Map((overrides.data??[]).map(row=>[row.product_id,row]))
  const rows=(products.data??[]).map(row=>({...row,override:byProduct.get(row.id)}))
  return <BranchCatalogManager businessId={context.businessId} branchId={branch.id} branchName={branch.restaurant_name??branch.name} initialRows={rows}/>
}
