import { MutationForm } from "@/components/mutation-form"
import { SubmitButton } from "@/components/submit-button"
import { GitBranch, Power } from "lucide-react"
import { addBranchAction, setBranchStatusAction } from "@/app/actions"
import { BranchLocationFields } from "@/components/branch-location-fields"
import { OperationsTable } from "@/components/operations-table"
import { PlatformShell } from "@/components/platform-shell"
import { DataNotice, PageHeader } from "@/components/ui"
import { requirePlatformStaff } from "@/lib/auth"
import { getModuleRows, getPlatformBusinessOptions } from "@/lib/data"

type Row = Record<string, unknown>

export default async function BranchesPage({ searchParams }: { searchParams: Promise<Record<string, string | undefined>> }) {
  const context = await requirePlatformStaff()
  const notice = await searchParams
  const [result, options] = await Promise.all([getModuleRows("branches", Number(notice.page ?? 1)), getPlatformBusinessOptions()])
  return <PlatformShell context={context}>
    <PageHeader eyebrow="MULTI-BRANCH CONTROL" title="Branches" description="Create branches, verify their real location and control availability safely."/>
    {result.error || options.error ? <DataNotice message={result.error ?? options.error ?? "Data unavailable"}/> : null}
    {notice.branch || notice.branchStatus ? <div className="success-banner">Branch change saved and audited.</div> : null}
    {notice.error ? <div className="form-error">Branch action rejected safely ({notice.error}).</div> : null}
    <div className="workspace-grid">
      <section className="panel">
        <header><div><p className="eyebrow">ADD LOCATION</p><h2>New branch</h2></div><GitBranch/></header>
        <MutationForm action={addBranchAction} className="form-grid compact-form">
          <input type="hidden" name="returnTo" value="/branches"/>
          <label className="span-2">Restaurant<select name="businessId" required><option value="">Select restaurant</option>{options.data.map((item) => <option key={String(item.id)} value={String(item.id)}>{String(item.name)}</option>)}</select></label>
          <label>Branch name<input name="name" required/></label><label>Code<input name="code" required placeholder="ISB-01"/></label>
          <BranchLocationFields/>
          <label>Timezone<input name="timezone" defaultValue="Asia/Karachi" required/></label><label>Reason<input name="reason" required defaultValue="New client location"/></label>
          <label className="check-row"><input type="checkbox" name="pickupEnabled" defaultChecked/>Pickup</label><label className="check-row"><input type="checkbox" name="deliveryEnabled"/>Request delivery</label>
          <p className="form-help span-2">Delivery stays disabled until coordinates and the existing delivery rule are both verified.</p>
          <SubmitButton className="button span-2"><GitBranch/>Create branch</SubmitButton>
        </MutationForm>
      </section>
      <section className="panel">
        <header><div><p className="eyebrow">SAFE STATUS</p><h2>Activation controls</h2></div><Power/></header>
        <div className="record-list">{result.data.map((row: Row) => <article className="record-row record-row-stack" key={String(row.id)}>
          <div><strong>{String(row.name)}</strong><span>{String((row.businesses as Row | null)?.name ?? "Restaurant")} · {String(row.city ?? "No city")}</span></div>
          <MutationForm action={setBranchStatusAction} className="inline-action" confirmation="Changing branch availability affects staff and customer ordering at this location. Confirm the selected action."><input type="hidden" name="returnTo" value="/branches"/><input type="hidden" name="businessId" value={String(row.business_id)}/><input type="hidden" name="branchId" value={String(row.id)}/><input type="hidden" name="active" value={row.is_active ? "false" : "true"}/><input type="hidden" name="reason" value="QaziPro branch lifecycle control"/><SubmitButton className={`button button-small ${row.is_active ? "button-danger" : "button-secondary"}`}>{row.is_active ? "Deactivate" : "Activate"}</SubmitButton></MutationForm>
        </article>)}</div>
      </section>
    </div>
    <OperationsTable rows={result.data} page={result.page} count={result.count} pageSize={result.pageSize} href="/branches" columns={["name", "businesses", "city", "is_active", "online_ordering_enabled", "temporarily_closed", "updated_at"]} empty="No branch records"/>
  </PlatformShell>
}
