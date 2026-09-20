import { ResourceScreen } from "@/components/resource-screen"
import { HeroSliderSettings } from "@/components/hero-slider-settings"
import { requirePermission } from "@/lib/auth"
import { createClient } from "@/lib/supabase/server"

export default async function Page(){
  const context=await requirePermission("banners.manage")
  const {data}=await (await createClient()).from("business_branding").select("hero_autoplay,hero_interval_ms,hero_transition_ms").eq("business_id",context.businessId).maybeSingle()
  return <><HeroSliderSettings businessId={context.businessId} initial={{autoplay:data?.hero_autoplay??true,intervalMs:data?.hero_interval_ms??5500,transitionMs:data?.hero_transition_ms??650}}/><div style={{height:24}}/><ResourceScreen resource="banners" context={context}/><div style={{height:32}}/><ResourceScreen resource="promotionalBanners" context={context}/></>
}
