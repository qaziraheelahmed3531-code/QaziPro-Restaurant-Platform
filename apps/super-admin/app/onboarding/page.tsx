import Link from "next/link"
import { FileSignature, Plus } from "lucide-react"
import { PlatformShell } from "@/components/platform-shell"
import { DataNotice, EmptyState, PageHeader, StatusBadge } from "@/components/ui"
import { requirePlatformStaff } from "@/lib/auth"
import { getOnboardingQueue } from "@/lib/data"

type Row = Record<string, unknown>

export default async function OnboardingPage() {
  const context = await requirePlatformStaff()
  const result = await getOnboardingQueue()
  return <PlatformShell context={context}>
    <PageHeader eyebrow="CLIENT ACTIVATION" title="Restaurant onboarding" description="Guided provisioning, client agreements and lifecycle gates in one audited queue." actions={<Link className="button" href="/onboarding/new"><Plus/>New restaurant</Link>}/>
    {result.error ? <DataNotice message={result.error}/> : null}
    {result.data.length ? <div className="table-wrap"><table><thead><tr><th>Restaurant</th><th>Owner</th><th>Locations</th><th>Lifecycle</th><th>Agreement</th><th>Updated</th><th/></tr></thead><tbody>{result.data.map((row) => {
      const business = row.businesses as Row | null
      const documents = (row.onboarding_documents ?? []) as Row[]
      const latest = [...documents].sort((a,b) => String(b.created_at).localeCompare(String(a.created_at)))[0]
      return <tr key={String(row.id)}><td><strong>{String(business?.name ?? "Unprovisioned lead")}</strong><small className="table-sub">{String(business?.slug ?? row.business_id ?? "No tenant yet")}</small></td><td>{String(row.owner_name)}<small className="table-sub">{String(row.owner_email)}</small></td><td>{String(row.expected_locations)}</td><td><StatusBadge value={row.lifecycle}/></td><td><StatusBadge value={latest?.status ?? "NOT CREATED"}/></td><td>{new Date(String(row.updated_at)).toLocaleDateString()}</td><td><Link className="detail-link" href={`/onboarding/${row.id}/agreement`}><FileSignature/>Agreement</Link></td></tr>
    })}</tbody></table></div> : <EmptyState title="No onboarding records" detail="Start a restaurant onboarding to create the first controlled tenant." action={{href:"/onboarding/new",label:"Add restaurant"}}/>}
  </PlatformShell>
}
