import { Globe2 } from "lucide-react"
import { upsertDomainAction } from "@/app/actions"
import { OperationsTable } from "@/components/operations-table"
import { PlatformShell } from "@/components/platform-shell"
import { DataNotice, PageHeader } from "@/components/ui"
import { requirePlatformStaff } from "@/lib/auth"
import { getModuleRows, getPlatformBusinessOptions } from "@/lib/data"

export default async function DomainsPage({ searchParams }: { searchParams: Promise<Record<string,string|undefined>> }) {
  const context=await requirePlatformStaff(),notice=await searchParams
  const [result,businesses]=await Promise.all([getModuleRows("domains",Number(notice.page??1)),getPlatformBusinessOptions()])
  return <PlatformShell context={context}><PageHeader eyebrow="WEBSITE DELIVERY" title="Domains" description="Record verified hostnames; DNS, SSL and auth remain Unknown until evidence exists."/>{result.error||businesses.error?<DataNotice message={result.error??businesses.error??"Data unavailable"}/>:null}{notice.saved?<div className="success-banner">Domain configuration saved; verification remains pending.</div>:null}{notice.error?<div className="form-error">Domain action rejected safely ({notice.error}).</div>:null}<section className="panel"><header><div><p className="eyebrow">DOMAIN REGISTRY</p><h2>Add or update hostname</h2></div><Globe2/></header><form action={upsertDomainAction} className="form-grid compact-form"><label>Restaurant<select name="businessId" required><option value="">Select restaurant</option>{businesses.data.map((item)=><option key={String(item.id)} value={String(item.id)}>{String(item.name)}</option>)}</select></label><label>Purpose<select name="purpose"><option>CUSTOMER</option><option>ADMIN</option><option>APP_LINKS</option><option>OTHER</option></select></label><label className="span-2">Hostname<input name="hostname" required placeholder="orders.restaurant.com"/></label><label className="span-2">Audit reason<input name="reason" required defaultValue="Restaurant domain configuration"/></label><button className="button span-2"><Globe2/>Save pending domain</button></form></section><OperationsTable rows={result.data} page={result.page} count={result.count} pageSize={result.pageSize} href="/domains" columns={["hostname","businesses","purpose","verification_status","dns_status","ssl_status","auth_redirect_ready","last_checked_at"]} empty="No domains configured"/></PlatformShell>
}
