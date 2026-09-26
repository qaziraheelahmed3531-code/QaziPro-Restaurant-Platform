import { MutationForm } from "@/components/mutation-form"
import { SubmitButton } from "@/components/submit-button"
import { CloudCog, GitBranch } from "lucide-react"
import { recordDeploymentAction } from "@/app/actions"
import { OperationsTable } from "@/components/operations-table"
import { PlatformShell } from "@/components/platform-shell"
import { DataNotice, PageHeader } from "@/components/ui"
import { requirePlatformStaff } from "@/lib/auth"
import { getModuleRows, getPlatformBusinessOptions } from "@/lib/data"

const components = ["CUSTOMER_WEBSITE","RESTAURANT_ADMIN","BACKEND_API","DESKTOP_POS","ANDROID","IOS","SUPER_ADMIN"]

export default async function DeploymentsPage({ searchParams }: { searchParams: Promise<{ created?: string; error?: string; page?: string }> }) {
  const context = await requirePlatformStaff(), notice = await searchParams
  const [result, businesses] = await Promise.all([getModuleRows("deployments",Number(notice.page??1)), getPlatformBusinessOptions()])
  return <PlatformShell context={context}><PageHeader eyebrow="RELEASE CONTROL" title="Deployments" description="Evidence registry for platform and restaurant releases. No provider integration is claimed without credentials."/>{result.error || businesses.error ? <DataNotice message={result.error ?? businesses.error ?? "Data unavailable"}/> : null}{notice.created ? <div className="success-banner">Deployment evidence recorded and audited.</div> : null}{notice.error ? <div className="form-error">Deployment record was rejected ({notice.error}).</div> : null}<details className="panel inline-create"><summary><CloudCog/>Record deployment evidence</summary><MutationForm action={recordDeploymentAction} className="form-grid compact-form"><label>Restaurant<select name="businessId"><option value="">Platform-wide</option>{businesses.data.map((item) => <option value={String(item.id)} key={String(item.id)}>{String(item.name)}</option>)}</select></label><label>Component<select name="component">{components.map((item) => <option key={item}>{item}</option>)}</select></label><label>Environment<select name="environment"><option>STAGING</option><option>PRODUCTION</option><option>LOCAL</option></select></label><label>Status<select name="status"><option>QUEUED</option><option>BUILDING</option><option>READY</option><option>FAILED</option><option>CANCELLED</option><option>ROLLED_BACK</option></select></label><label>Version<input name="version"/></label><label>Commit SHA<input name="commitSha"/></label><label>Provider<input name="provider" placeholder="Vercel / EAS / manual"/></label><label>Provider reference<input name="providerReference"/></label><label className="span-2">Failure summary<input name="errorSummary"/></label><label className="span-2">Audit reason<input name="reason" required defaultValue="Release evidence recorded"/></label><SubmitButton className="button span-2"><GitBranch/>Save deployment</SubmitButton></MutationForm></details><OperationsTable rows={result.data} page={result.page} count={result.count} pageSize={result.pageSize} href="/deployments" columns={["businesses","component","environment","version","provider","status","started_at","finished_at"]} empty="No deployment records"/></PlatformShell>
}
