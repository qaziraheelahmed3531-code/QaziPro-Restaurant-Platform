import Link from "next/link"
import { requirePlatformPermission } from "@/lib/auth"
import { createClient } from "@/lib/supabase/server"
import { getPlatformBranding } from "@/lib/branding"
import { PlatformShell } from "@/components/platform-shell"
import { BrandingForm } from "@/components/branding-form"
import { PageHeader } from "@/components/ui"

export default async function SettingsPage() {
  const context = await requirePlatformPermission("team.manage")
  const client = await createClient()
  const [branding, roles] = await Promise.all([getPlatformBranding(), client.from("platform_staff_roles").select("platform_roles!inner(key)").eq("staff_user_id", context.userId).eq("platform_roles.key", "PLATFORM_OWNER").limit(1)])
  return <PlatformShell context={context}><PageHeader eyebrow="PLATFORM SETTINGS" title="Settings" description="Manage QaziPro identity and platform access. Restaurant branding stays separate."/>
    <section className="panel"><header><h2>QaziPro Branding</h2></header><BrandingForm branding={branding} owner={!roles.error && Boolean(roles.data?.length)}/></section>
    <div className="card-grid settings-links"><Link className="entity-card" href="/team"><h2>Platform access</h2><p>Manage authorized staff, roles and permissions.</p></Link>{context.permissions.includes("integrations.manage") ? <Link className="entity-card" href="/integrations"><h2>Integrations</h2><p>Review connection readiness without exposing credentials.</p></Link> : null}</div>
  </PlatformShell>
}
