import Link from "next/link"
import { AlertTriangle, ArrowRight, Building2, CircleDollarSign, GitBranch, Network, ReceiptText, Store, TriangleAlert } from "lucide-react"
import { requirePlatformStaff } from "@/lib/auth"
import { getOverview } from "@/lib/data"
import { PlatformShell } from "@/components/platform-shell"
import { DataNotice, EmptyState, PageHeader, StatusBadge } from "@/components/ui"

const metric = (value: number | null, money = false) => value === null ? "—" : money ? `PKR ${value.toLocaleString()}` : value.toLocaleString()

export default async function OverviewPage() {
  const context = await requirePlatformStaff()
  const result = await getOverview()
  const items = [
    ["Restaurants", metric(result.data.metrics.restaurants), "Total managed tenants", Building2, "/restaurants"],
    ["Active", metric(result.data.metrics.active), "Serving live operations", Store, "/restaurants?status=active"],
    ["Onboarding", metric(result.data.metrics.onboarding), "Not yet activated", GitBranch, "/onboarding"],
    ["Branches", metric(result.data.metrics.branches), "Active locations", Network, "/branches"],
    ["Orders today", metric(result.data.metrics.ordersToday), "Across visible tenants", ReceiptText, "/restaurants"],
    ["GMV today", metric(result.data.metrics.gmvToday, true), "Authoritative order totals", CircleDollarSign, "/billing"],
  ] as const
  return <PlatformShell context={context}><PageHeader eyebrow="PLATFORM OVERVIEW" title="Good morning. Here is what needs attention." description="Real platform data only—unavailable monitoring remains explicitly unknown." actions={<Link className="button" href="/onboarding/new">Create restaurant<ArrowRight/></Link>}/>{result.error?<DataNotice message={result.error}/>:null}<section className="metric-grid">{items.map(([label,value,detail,Icon,href])=><Link href={href} className="metric-card" key={label}><div><span>{label}</span><strong>{value}</strong><small>{detail}</small></div><Icon/></Link>)}</section><div className="dashboard-grid"><section className="panel"><header><div><p className="eyebrow">ATTENTION CENTER</p><h2>Open incidents</h2></div><Link href="/health">View all</Link></header>{result.data.incidents.length?<div className="record-list">{result.data.incidents.map((row)=><Link href="/health" key={String(row.id)}><span className={`severity-dot severity-${String(row.severity).toLowerCase()}`}/><div><strong>{String(row.title)}</strong><small>{String(row.last_seen_at ?? "Not checked")}</small></div><StatusBadge value={row.status}/></Link>)}</div>:<EmptyState title="No incident data" detail={result.error?"Monitoring becomes available after the foundation migration.":"No unresolved incidents are recorded."}/>}</section><section className="panel"><header><div><p className="eyebrow">RELEASE CONTROL</p><h2>Latest deployments</h2></div><Link href="/deployments">View all</Link></header>{result.data.deployments.length?<div className="record-list">{result.data.deployments.map((row)=><Link href="/deployments" key={String(row.id)}><span className="record-icon"><GitBranch/></span><div><strong>{String(row.component).replaceAll("_"," ")}</strong><small>{String(row.environment)} · {String(row.created_at ?? "")}</small></div><StatusBadge value={row.status}/></Link>)}</div>:<EmptyState title="No deployment records" detail="Provider integrations and release events will appear here when recorded."/>}</section></div><section className="attention-strip"><div><TriangleAlert/><span><strong>{metric(result.data.metrics.openIncidents)} open incidents</strong><small>Health state is not assumed when monitoring is missing.</small></span></div><div><AlertTriangle/><span><strong>{metric(result.data.metrics.failedDeployments)} recent failed deployments</strong><small>Review provider configuration and release logs.</small></span></div><div><CircleDollarSign/><span><strong>{metric(result.data.metrics.overdueSubscriptions)} billing accounts need attention</strong><small>Suspension never deletes restaurant history.</small></span></div></section></PlatformShell>
}
