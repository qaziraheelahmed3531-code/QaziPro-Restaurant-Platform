import { LoyaltyManager, type LoyaltyDashboard, type LoyaltySettings } from "@/components/loyalty-manager"
import { requirePermission } from "@/lib/auth"
import { createClient } from "@/lib/supabase/server"

export default async function Page() {
  const context = await requirePermission("loyalty.manage")
  const supabase = await createClient()
  const [settings, dashboard] = await Promise.all([
    supabase.from("loyalty_settings").select("*").eq("business_id", context.businessId).single(),
    supabase.rpc("loyalty_admin_dashboard", { p_business_id: context.businessId }),
  ])
  if (settings.error || dashboard.error) return <div className="state-box">Loyalty settings are unavailable. Apply the latest database migration and retry.</div>
  return <LoyaltyManager businessId={context.businessId} initialSettings={settings.data as LoyaltySettings} initialDashboard={dashboard.data as LoyaltyDashboard} />
}
