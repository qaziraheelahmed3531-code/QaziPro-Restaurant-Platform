import { WaiterTerminal, type WaiterDashboard } from "@/components/waiter-terminal"
import { WaiterServiceRequests, type WaiterCallRow } from "@/components/waiter-service-requests"
import { requirePermission } from "@/lib/auth"
import { getSelectedBranch } from "@/lib/branch"
import { mediaPreviewUrl } from "@/lib/media"
import { createClient } from "@/lib/supabase/server"

export default async function Page() {
  const context = await requirePermission("waiter.use")
  const supabase = await createClient()
  const branch = await getSelectedBranch(supabase, context.businessId, context.assignedBranchId)
  if (!branch) return <div className="state-box">No active restaurant is assigned to this waiter.</div>
  const [categories,products,deals,assignments,dashboard,tables,branding,serviceRequests] = await Promise.all([
    supabase.from("categories").select("id,name").eq("business_id",context.businessId).eq("is_active",true).order("sort_order"),
    supabase.from("products").select("id,name,sku,category_id,base_price,sale_price,is_available,product_images(url,is_primary)").eq("business_id",context.businessId).eq("is_active",true).eq("is_available",true).order("sort_order"),
    supabase.from("deals").select("id,name,deal_price,image_url,starts_at,ends_at").eq("business_id",context.businessId).eq("is_active",true).order("sort_order"),
    supabase.from("product_modifier_groups").select("product_id,sort_order,modifier_groups(id,name,selection_type,is_required,min_selections,max_selections,modifier_options(id,name,price_adjustment,is_default,is_active,sort_order,image_url))").order("sort_order"),
    supabase.rpc("waiter_dashboard",{p_branch_id:branch.id}),
    supabase.rpc("waiter_table_dashboard",{p_branch_id:branch.id}),
    supabase.from("business_branding").select("logo_url").eq("business_id",context.businessId).maybeSingle(),
    supabase.from("restaurant_table_service_requests").select("id,status,created_at,restaurant_tables(name)").eq("business_id",context.businessId).eq("branch_id",branch.id).in("status",["PENDING","ACKNOWLEDGED"]).order("created_at",{ascending:true}),
  ])
  return <><WaiterServiceRequests key={`${context.businessId}:${branch.id}`} businessId={context.businessId} branchId={branch.id} initialRequests={(serviceRequests.data??[]) as WaiterCallRow[]} initialError={Boolean(serviceRequests.error)} /><WaiterTerminal
    businessId={context.businessId}
    waiterId={context.userId}
    branch={{id:branch.id,name:branch.restaurant_name??branch.name,city:branch.city}}
    logoUrl={mediaPreviewUrl(branding.data?.logo_url??"",process.env.CUSTOMER_APP_URL)}
    categories={categories.data??[]}
    products={(products.data??[]).map(product=>({...product,product_images:product.product_images.map(image=>({...image,url:mediaPreviewUrl(image.url,process.env.CUSTOMER_APP_URL)}))}))}
    deals={(deals.data??[]).map(deal=>({...deal,image_url:deal.image_url?mediaPreviewUrl(deal.image_url,process.env.CUSTOMER_APP_URL):null}))}
    assignments={assignments.data??[]}
    tables={(tables.data??[]) as Array<{id:string;code:string;name:string;seats:number;session_id:string|null;order_number:string|null}>}
    initialDashboard={(dashboard.data??{todayOrders:0,activeOrders:0,completedOrders:0,todaySales:0,recentOrders:[]}) as WaiterDashboard}
  /></>
}
