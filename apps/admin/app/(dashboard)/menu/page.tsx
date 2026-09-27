import { ProductsManager } from "@/components/products-manager";
import { requirePermission } from "@/lib/auth";
import { createClient } from "@/lib/supabase/server";
export default async function Page({ searchParams }: { searchParams: Promise<{ new?: string }> }) {
  const params = await searchParams;
  const context = await requirePermission("products.manage");
  const supabase = await createClient();
  const [categories, posSections, products, groups] = await Promise.all([
    supabase
      .from("categories")
      .select("id,name,sort_order")
      .eq("business_id", context.businessId)
      .order("sort_order"),
    supabase
      .from("pos_sections")
      .select("id,name,sort_order")
      .eq("business_id", context.businessId)
      .eq("is_active", true)
      .order("sort_order"),
    supabase
      .from("products")
      .select(
        "id,name,slug,sku,category_id,pos_section_id,description,base_price,sale_price,badge,is_available,is_featured,is_active,sort_order,product_images(id,url,alt_text,is_primary),product_modifier_groups(modifier_group_id)",
      )
      .eq("business_id", context.businessId)
      .order("sort_order"),
    supabase
      .from("modifier_groups")
      .select(
        "id,name,selection_type,is_required,min_selections,max_selections",
      )
      .eq("business_id", context.businessId)
      .eq("is_active", true)
      .order("sort_order"),
  ]);
  if ([categories, posSections, products, groups].some(result => result.error)) {
    // Do not turn a failed tenant-scoped read into a misleading empty menu.
    throw new Error("Restaurant menu could not be loaded.");
  }
  return (
    <ProductsManager
      businessId={context.businessId}
      categories={categories.data ?? []}
      posSections={posSections.data ?? []}
      initialProducts={products.data ?? []}
      groups={(groups.data ?? []) as never}
      canManageOptions={
        context.role === "OWNER" ||
        context.permissions.includes("modifiers.manage")
      }
      initialOpen={params.new === "1"}
      assetOrigin={process.env.CUSTOMER_APP_URL}
    />
  );
}
