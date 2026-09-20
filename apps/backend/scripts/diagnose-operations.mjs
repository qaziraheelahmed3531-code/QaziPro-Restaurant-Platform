import { createClient } from "../../customer/node_modules/@supabase/supabase-js/dist/index.mjs"

process.loadEnvFile(new URL("../.env.local", import.meta.url))
const db=createClient(process.env.NEXT_PUBLIC_SUPABASE_URL,process.env.SUPABASE_SERVICE_ROLE_KEY,{auth:{persistSession:false,autoRefreshToken:false}})
const branchId="22222222-2222-4222-8222-222222222222"
const {data:branch,error:branchError}=await db.from("branches").select("id,business_id,restaurant_name,name,city").eq("id",branchId).single()
if(branchError)throw branchError
const [products,categories,deals,assignments]=await Promise.all([
  db.from("products").select("id,name,category_id,is_active,is_available,base_price,sale_price").eq("business_id",branch.business_id),
  db.from("categories").select("id,name,is_active").eq("business_id",branch.business_id),
  db.from("deals").select("id,name,is_active,starts_at,ends_at,deal_price").eq("business_id",branch.business_id),
  db.from("product_modifier_groups").select("product_id,modifier_group_id")
])
for(const result of [products,categories,deals,assignments])if(result.error)throw result.error
console.log(JSON.stringify({branch:{name:branch.restaurant_name,city:branch.city},products:{total:products.data.length,active:products.data.filter(row=>row.is_active).length,sellable:products.data.filter(row=>row.is_active&&row.is_available).length},categories:{total:categories.data.length,active:categories.data.filter(row=>row.is_active).length},deals:{total:deals.data.length,active:deals.data.filter(row=>row.is_active).length},modifierAssignments:assignments.data.filter(row=>products.data.some(product=>product.id===row.product_id)).length}))
