import { BrandingManager, type BrandingSettings } from "@/components/branding-manager"
import { requirePermission } from "@/lib/auth"
import { createClient } from "@/lib/supabase/server"

const defaults: BrandingSettings = { display_name:"RESTAURANT",logo_url:"",footer_logo_url:"",favicon_url:"",primary_color:"#a92114",secondary_color:"#e7a81a",website_background_color:"#fbf7f2",header_background_color:"#ffffff",footer_background_color:"#211d1b",product_card_background_color:"#ffffff",text_color:"#211d1b",footer_text_color:"#f7f2ee",font_family:"Geist",font_stylesheet_url:"",header_logo_size_px:56,footer_logo_size_px:88,footer_description:"" }

export default async function Page(){
  const context=await requirePermission("branding.manage")
  const {data}=await (await createClient()).from("business_branding").select("*").eq("business_id",context.businessId).maybeSingle()
  const initial=Object.fromEntries(Object.entries(defaults).map(([key,value])=>[key,data?.[key]??value])) as BrandingSettings
  return <BrandingManager businessId={context.businessId} initial={initial} assetOrigin={process.env.CUSTOMER_APP_URL}/>
}
