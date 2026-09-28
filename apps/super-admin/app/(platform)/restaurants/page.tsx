import { MutationForm } from "@/components/mutation-form"
import { SubmitButton } from "@/components/submit-button"
import Link from "next/link"
import { ChevronLeft, ChevronRight, Filter, Plus, Search } from "lucide-react"
import { transitionRestaurantAction } from "@/app/actions"
import { PlatformShell } from "@/components/platform-shell"
import { DataNotice, DetailLink, EmptyState, PageHeader, StatusBadge } from "@/components/ui"
import { requirePlatformStaff } from "@/lib/auth"
import { getRestaurants } from "@/lib/data"

const relation = (value: unknown) => Array.isArray(value) ? value : value ? [value] : []

export default async function RestaurantsPage({ searchParams }: { searchParams: Promise<{ q?: string; page?: string; status?: string; deleted?: string }> }) {
  const context = await requirePlatformStaff()
  const params = await searchParams
  const query = params.q?.trim() ?? ""
  const page = Math.max(1, Number(params.page) || 1)
  const status = params.status ?? "all"
  const result = await getRestaurants(query, page, status)

  return <PlatformShell context={context}>
    <PageHeader eyebrow="TENANT OPERATIONS" title="Restaurants" description="One canonical directory across websites, apps, branches and POS." actions={context.permissions.includes("restaurants.create") ? <Link className="button" href="/onboarding/new"><Plus/>New restaurant</Link> : undefined}/>
    {params.deleted === "1" ? <p className="success-banner" role="status">Restaurant and tenant-owned media permanently deleted. The platform audit event remains.</p> : null}
    {params.deleted === "media-pending" ? <p className="attention-banner" role="alert">Restaurant records were permanently deleted, but media cleanup could not be fully confirmed. The platform audit retains the cleanup manifest. Review it before closing this task.</p> : null}
    <form className="directory-toolbar"><label><Search/><input name="q" defaultValue={query} placeholder="Search name, key or city"/></label><select name="status" defaultValue={status} aria-label="Restaurant status"><option value="all">All statuses</option><option value="active">Active</option><option value="inactive">Inactive</option></select><button className="button button-secondary"><Filter/>Apply</button><span>{result.count.toLocaleString()} records</span></form>
    {result.error ? <DataNotice message={result.error}/> : null}
    {result.data.length ? <div className="table-wrap"><table><thead><tr><th>Restaurant</th><th>Owner</th><th>Lifecycle</th><th>Branches</th><th>Package / billing</th><th>Website</th><th>Apps</th><th>State</th><th>Actions</th></tr></thead><tbody>{result.data.map((row) => {
      const onboarding = relation(row.restaurant_onboarding)[0] as Record<string,unknown> | undefined
      const subscription = relation(row.restaurant_subscriptions)[0] as Record<string,unknown> | undefined
      const packageValue = relation(subscription?.service_packages)[0] as Record<string,unknown> | undefined
      const branches = relation(row.branches)
      const domains = relation(row.platform_domain_records) as Record<string,unknown>[]
      const apps = relation(row.mobile_app_records) as Record<string,unknown>[]
      const lifecycle = String(onboarding?.lifecycle ?? "UNTRACKED")
      const quickTransition = lifecycle === "ACTIVE" ? "SUSPENDED" : lifecycle === "SUSPENDED" ? "ACTIVE" : ""
      return <tr key={String(row.id)}>
        <td><DetailLink href={`/restaurants/${row.id}`}><span className="restaurant-cell"><b>{String(row.name)}</b><small>{String(row.slug)} · {String(row.city)}</small></span></DetailLink></td>
        <td><ValuePair primary={onboarding?.owner_name} secondary={onboarding?.owner_email}/></td>
        <td><StatusBadge value={lifecycle}/></td>
        <td>{branches.filter((branch) => Boolean((branch as Record<string,unknown>).is_active)).length}/{branches.length}</td>
        <td><ValuePair primary={packageValue?.name ?? "Unassigned"} secondary={subscription?.status}/></td>
        <td><ValuePair primary={domains.find((domain) => domain.purpose === "CUSTOMER")?.hostname ?? "Not configured"} secondary={domains.find((domain) => domain.purpose === "CUSTOMER")?.verification_status}/></td>
        <td><div className="status-stack">{apps.map((app) => <StatusBadge key={String(app.platform)} value={`${app.platform}: ${app.release_status}`}/>)}</div></td>
        <td><StatusBadge value={row.is_active ? "ACTIVE" : "INACTIVE"}/></td>
        <td><details className="row-actions"><summary>Manage</summary><Link className="text-link" href={`/restaurants/${row.id}`}>Open Restaurant 360</Link>{context.roleNames.includes("Platform Owner") && process.env.APP_ENVIRONMENT === "staging" ? <Link className="text-link" href={`/restaurants/${row.id}?tab=overview#permanent-delete`}>Permanently delete…</Link> : null}{quickTransition && context.permissions.includes("restaurants.edit") ? <MutationForm action={transitionRestaurantAction} confirmation="Changing lifecycle can block staff and storefront access. Historical data is preserved. Confirm the selected state and audit reason."><input type="hidden" name="businessId" value={String(row.id)}/><input type="hidden" name="lifecycle" value={quickTransition}/><label>Audit reason<input name="reason" required minLength={3} placeholder={quickTransition === "SUSPENDED" ? "Reason for deactivation" : "Reason for reactivation"}/></label><SubmitButton className={`button button-small ${quickTransition === "SUSPENDED" ? "button-danger" : "button-secondary"}`}>{quickTransition === "SUSPENDED" ? "Deactivate" : "Reactivate"}</SubmitButton></MutationForm> : null}</details></td>
      </tr>
    })}</tbody></table></div> : <EmptyState title="No restaurants found" detail={query ? "Try a broader search." : "Create the first restaurant through the audited onboarding flow."} action={!query ? { href: "/onboarding/new", label: "Create restaurant" } : undefined}/>}
    <nav className="pagination"><Link aria-disabled={result.page <= 1} href={`/restaurants?q=${encodeURIComponent(query)}&status=${encodeURIComponent(status)}&page=${Math.max(1,result.page-1)}`}><ChevronLeft/>Previous</Link><span>Page {result.page} of {Math.max(1,Math.ceil(result.count/result.pageSize))}</span><Link aria-disabled={result.page*result.pageSize >= result.count} href={`/restaurants?q=${encodeURIComponent(query)}&status=${encodeURIComponent(status)}&page=${result.page+1}`}>Next<ChevronRight/></Link></nav>
  </PlatformShell>
}

function ValuePair({ primary, secondary }: { primary: unknown; secondary?: unknown }) {
  return <span className="value-pair"><b>{String(primary ?? "—")}</b>{secondary ? <small>{String(secondary)}</small> : null}</span>
}
