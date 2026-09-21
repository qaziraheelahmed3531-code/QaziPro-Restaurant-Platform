import { PlugZap } from "lucide-react"
import { upsertIntegrationStatusAction } from "@/app/actions"
import { OperationsTable } from "@/components/operations-table"
import { PlatformShell } from "@/components/platform-shell"
import { DataNotice, PageHeader } from "@/components/ui"
import { requirePlatformStaff } from "@/lib/auth"
import { getModuleRows, getPlatformBusinessOptions } from "@/lib/data"

export default async function IntegrationsPage({ searchParams }: { searchParams: Promise<Record<string,string|undefined>> }) {
  const context=await requirePlatformStaff(),notice=await searchParams
  const [result,businesses]=await Promise.all([getModuleRows("integrations",Number(notice.page??1)),getPlatformBusinessOptions()])
  return <PlatformShell context={context}><PageHeader eyebrow="SECRET-SAFE READINESS" title="Integrations" description="Track configuration status only. Secret values are never rendered or stored here."/>{result.error||businesses.error?<DataNotice message={result.error??businesses.error??"Data unavailable"}/>:null}{notice.saved?<div className="success-banner">Integration readiness saved and audited.</div>:null}{notice.error?<div className="form-error">Integration action rejected safely ({notice.error}).</div>:null}<section className="panel"><header><div><p className="eyebrow">STATUS REGISTRY</p><h2>Review provider readiness</h2></div><PlugZap/></header><form action={upsertIntegrationStatusAction} className="form-grid compact-form"><label>Scope<select name="businessId"><option value="">Platform-wide</option>{businesses.data.map((item)=><option key={String(item.id)} value={String(item.id)}>{String(item.name)}</option>)}</select></label><label>Provider<input name="provider" required placeholder="SUPABASE / FCM / APNS"/></label><label>Status<select name="status"><option>MISSING</option><option>INVALID</option><option>NEEDS_REVIEW</option><option>DISABLED</option></select></label><label>Credential expiry<input name="expiresAt" type="datetime-local"/></label><label className="span-2">Safe status message<input name="message" placeholder="No secret values"/></label><label className="span-2">Audit reason<input name="reason" required defaultValue="Integration readiness review"/></label><button className="button span-2"><PlugZap/>Save status</button></form></section><OperationsTable rows={result.data} page={result.page} count={result.count} pageSize={result.pageSize} href="/integrations" columns={["provider","businesses","status","last_checked_at","expires_at","message"]} empty="No integration checks recorded"/></PlatformShell>
}
