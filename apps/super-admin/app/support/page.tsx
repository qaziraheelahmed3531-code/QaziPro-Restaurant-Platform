import { Headphones, TicketPlus } from "lucide-react"
import { createSupportTicketAction } from "@/app/actions"
import { OperationsTable } from "@/components/operations-table"
import { PlatformShell } from "@/components/platform-shell"
import { DataNotice, PageHeader } from "@/components/ui"
import { requirePlatformStaff } from "@/lib/auth"
import { getModuleRows, getPlatformBusinessOptions } from "@/lib/data"

export default async function SupportPage({ searchParams }: { searchParams: Promise<{ created?: string; error?: string; page?: string }> }) {
  const context = await requirePlatformStaff()
  const notice = await searchParams
  const [result, businesses] = await Promise.all([getModuleRows("support",Number(notice.page??1)), getPlatformBusinessOptions()])
  return <PlatformShell context={context}>
    <PageHeader eyebrow="CLIENT CARE" title="Support workspace" description="Restaurant-scoped issues, safe notes and clear ownership without sharing client passwords."/>
    {result.error || businesses.error ? <DataNotice message={result.error ?? businesses.error ?? "Data unavailable"}/> : null}
    {notice.created ? <div className="success-banner">Support ticket opened and audited.</div> : null}
    {notice.error ? <div className="form-error">Support action was rejected safely ({notice.error}).</div> : null}
    <div className="workspace-grid">
      <section className="panel"><header><div><p className="eyebrow">NEW TICKET</p><h2>Record client issue</h2></div><TicketPlus/></header><form action={createSupportTicketAction} className="form-grid compact-form">
        <label className="span-2">Restaurant<select name="businessId" required defaultValue=""><option value="" disabled>Select restaurant</option>{businesses.data.map((item) => <option value={String(item.id)} key={String(item.id)}>{String(item.name)}</option>)}</select></label>
        <label>Category<input name="category" required placeholder="ORDERING"/></label>
        <label>Severity<select name="severity" defaultValue="NORMAL"><option>LOW</option><option>NORMAL</option><option>HIGH</option><option>CRITICAL</option></select></label>
        <label className="span-2">Subject<input name="subject" required/></label>
        <label className="span-2">Description<textarea name="description" required rows={5}/></label>
        <label className="span-2">Audit reason<input name="reason" required defaultValue="Client support request"/></label>
        <button className="button span-2"><Headphones/>Open ticket</button>
      </form></section>
      <section className="panel"><header><div><p className="eyebrow">SAFE SUPPORT</p><h2>Access boundary</h2></div></header><p className="muted">This workspace never requests owner passwords and provides no unsafe remote-control capability. Any future support elevation must remain explicit, time-limited, read-only by default and audited.</p></section>
    </div>
    <OperationsTable rows={result.data} page={result.page} count={result.count} pageSize={result.pageSize} href="/support" columns={["ticket_number","businesses","subject","category","severity","status","created_at"]} empty="No support tickets"/>
  </PlatformShell>
}
