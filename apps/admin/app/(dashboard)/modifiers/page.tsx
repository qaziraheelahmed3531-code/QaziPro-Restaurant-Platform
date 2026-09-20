import { OptionsManager } from "@/components/options-manager"
import { requirePermission } from "@/lib/auth"
import { createClient } from "@/lib/supabase/server"
import { mediaPreviewUrl } from "@/lib/media"
export default async function Page() {
  const context = await requirePermission("modifiers.manage")
  const supabase = await createClient()
  const [groups, usage, products] = await Promise.all([
    supabase.from("modifier_groups").select("id,name,customer_instruction,selection_type,is_required,min_selections,max_selections,is_active,sort_order,modifier_options(id,name,price_adjustment,is_active,is_default,sort_order,linked_product_id,image_url)").eq("business_id",context.businessId).eq("is_active",true).order("sort_order"),
    supabase.from("product_modifier_groups").select("modifier_group_id,products!inner(id,name,business_id)").eq("products.business_id",context.businessId),
    supabase.from("products").select("id,name,base_price,sale_price,product_images(url,is_primary,sort_order)").eq("business_id",context.businessId).eq("is_active",true).eq("is_available",true).order("name"),
  ])
  if (groups.error || usage.error || products.error) throw new Error("Unable to load product options.")
  return <OptionsManager businessId={context.businessId} initialGroups={(groups.data??[]) as never} usage={(usage.data??[]) as never} products={(products.data??[]).map(product=>({...product,product_images:product.product_images.map(image=>({...image,url:mediaPreviewUrl(image.url,process.env.CUSTOMER_APP_URL)}))}))}/>
}
