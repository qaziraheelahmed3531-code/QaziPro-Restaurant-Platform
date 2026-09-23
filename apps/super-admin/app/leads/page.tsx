import Link from "next/link"
import { PlatformShell } from "@/components/platform-shell"
import { DataNotice, EmptyState, PageHeader, StatusBadge } from "@/components/ui"
import { requirePlatformPermission } from "@/lib/auth"
import { createClient } from "@/lib/supabase/server"
import { updateLeadStatusAction } from "./actions"

const statuses = ["NEW","CONTACTED","QUALIFIED","DEMO_SCHEDULED","PROPOSAL","WON","LOST","CONVERTED","CLOSED"]

export default async function LeadsPage({ searchParams }: { searchParams: Promise<{ page?: string; status?: string; updated?: string; error?: string }> }) {
  const context = await requirePlatformPermission("onboarding.manage")
  const params = await searchParams
  const page = Math.min(10000, Math.max(1, Number.parseInt(params.page ?? "1", 10) || 1))
  const status = statuses.includes(params.status ?? "") ? params.status : undefined
  const pageSize = 25
  const client = await createClient()
  let request = client.from("platform_demo_requests")
    .select("id,full_name,business_name,email,phone,branch_band,source,lead_kind,services,message,source_page,status,preferred_contact_method,budget_range,created_at", { count: "exact" })
    .order("created_at", { ascending: false })
    .range((page - 1) * pageSize, page * pageSize - 1)
  if (status) request = request.eq("status", status)
  const { data, count, error } = await request
  const rows = data ?? []
  return <PlatformShell context={context}>
    <PageHeader eyebrow="SALES INBOX" title="Website leads" description="New public website, demo and quote inquiries. Only authorized QaziPro onboarding staff can view this queue."/>
    {params.updated ? <div className="success-banner">Lead status updated and audited.</div> : null}
    {params.error ? <div className="form-error">The lead action was rejected safely ({params.error}).</div> : null}
    {error ? <DataNotice message="Lead data is temporarily unavailable. Verify the staging lead migration and staff permission."/> : null}
    <div className="filter-row"><Link href="/leads">All</Link>{statuses.map((value) => <Link href={`/leads?status=${value}`} key={value}>{value.replaceAll("_"," ")}</Link>)}</div>
    {rows.length ? <div className="table-wrap"><table><thead><tr><th>Business</th><th>Contact</th><th>Type</th><th>Interests</th><th>Message</th><th>Status</th><th>Received</th></tr></thead><tbody>{rows.map((row) => <tr key={row.id}><td><strong>{row.business_name}</strong><small className="table-sub">{row.source_page || row.source}</small></td><td>{row.full_name}<small className="table-sub">{row.email}<br/>{row.phone} · {row.preferred_contact_method ?? "WHATSAPP"}</small></td><td>{row.lead_kind ?? "DEMO"}<small className="table-sub">{row.budget_range || "No budget supplied"}</small></td><td>{Array.isArray(row.services) && row.services.length ? row.services.join(", ").replaceAll("_"," ") : "—"}</td><td title={row.message || ""}>{row.message ? `${row.message.slice(0, 100)}${row.message.length > 100 ? "…" : ""}` : "—"}</td><td><StatusBadge value={row.status}/><form action={updateLeadStatusAction} className="inline-status-form"><input type="hidden" name="id" value={row.id}/><select name="status" defaultValue={row.status}>{statuses.map((value) => <option value={value} key={value}>{value.replaceAll("_"," ")}</option>)}</select><button className="button button-small" type="submit">Save</button></form></td><td>{new Date(row.created_at).toLocaleDateString()}</td></tr>)}</tbody></table></div> : !error ? <EmptyState title="No leads in this view" detail="Website, demo and quote inquiries will appear here after a successful submission."/> : null}
    {(count ?? 0) > pageSize ? <nav className="pagination" aria-label="Leads pagination"><span>Page {page} of {Math.ceil((count ?? 0)/pageSize)}</span>{page > 1 ? <Link href={`/leads?page=${page-1}${status ? `&status=${status}` : ""}`}>Previous</Link> : null}{page * pageSize < (count ?? 0) ? <Link href={`/leads?page=${page+1}${status ? `&status=${status}` : ""}`}>Next</Link> : null}</nav> : null}
  </PlatformShell>
}
