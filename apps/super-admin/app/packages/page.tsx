import { MutationForm } from "@/components/mutation-form"
import { SubmitButton } from "@/components/submit-button"
import { PackagePlus } from "lucide-react"
import { createServicePackageAction, setServicePackageStatusAction } from "@/app/actions"
import { PlatformShell } from "@/components/platform-shell"
import { DataNotice, EmptyState, PageHeader, StatusBadge } from "@/components/ui"
import { requirePlatformStaff } from "@/lib/auth"
import { getModuleRows } from "@/lib/data"
import { supportedServices } from "@/lib/onboarding"

export default async function PackagesPage({ searchParams }: { searchParams: Promise<{ created?: string; updated?: string; error?: string; page?: string }> }) {
  const notice = await searchParams
  const context = await requirePlatformStaff()
  const result = await getModuleRows("packages", Number(notice.page ?? 1))
  const errorMessage = notice.error === "in-use"
    ? "This package is assigned to a live subscription and cannot be deactivated. Move those restaurants first."
    : notice.error ? "The package action was rejected. Review the values and try again." : null

  return <PlatformShell context={context}>
    <PageHeader eyebrow="COMMERCIAL CONTROL" title="Service packages" description="Package defaults and explicit capabilities—no hidden frontend-only flags."/>
    {result.error ? <DataNotice message={result.error}/> : null}
    {notice.created ? <div className="success-banner">Package created and audited.</div> : null}
    {notice.updated ? <div className="success-banner">Package status updated and audited.</div> : null}
    {errorMessage ? <div className="form-error">{errorMessage}</div> : null}
    <div className="workspace-grid">
      <section className="panel">
        <header><div><p className="eyebrow">PACKAGE CATALOG</p><h2>Configured packages</h2></div></header>
        {result.data.length ? <div className="record-list">{result.data.map((row) => <article className="record-row record-row-stack" key={String(row.id)}>
          <div><strong>{String(row.name)} · {String(row.code)}</strong><small>{String(row.currency)} {Number(row.base_fee ?? 0).toLocaleString()} / {String(row.billing_frequency).toLowerCase()} · {String(row.included_branches)} branches included</small></div>
          <StatusBadge value={row.is_active ? "ACTIVE" : "INACTIVE"}/>
          <MutationForm action={setServicePackageStatusAction} className="inline-action" confirmation="Change package availability? Packages with current subscribers cannot be deactivated.">
            <input type="hidden" name="packageId" value={String(row.id)}/><input type="hidden" name="active" value={row.is_active ? "false" : "true"}/><input type="hidden" name="reason" value="QaziPro package catalog status change"/>
            <SubmitButton className={`button button-small ${row.is_active ? "button-danger" : "button-secondary"}`}>{row.is_active ? "Deactivate" : "Activate"}</SubmitButton>
          </MutationForm>
        </article>)}</div> : <EmptyState title="No packages configured" detail="Create QaziPro Standard here. The onboarding wizard will then load it automatically—no package ID is hardcoded."/>}
      </section>
      <section className="panel">
        <header><div><p className="eyebrow">NEW PACKAGE</p><h2>Commercial template</h2></div><PackagePlus/></header>
        <MutationForm action={createServicePackageAction} className="form-grid compact-form">
          <label>Package code<input name="code" required pattern="[A-Z][A-Z0-9_]*" placeholder="QAZIPRO_STANDARD"/></label><label>Display name<input name="name" required placeholder="QaziPro Standard"/></label>
          <label>Currency<input name="currency" defaultValue="PKR" maxLength={3}/></label><label>Billing<select name="billingFrequency"><option>MONTHLY</option><option>QUARTERLY</option><option>ANNUAL</option><option>CUSTOM</option></select></label>
          <label>Base fee<input name="baseFee" type="number" min="0" defaultValue="0"/></label><label>Setup fee<input name="setupFee" type="number" min="0" defaultValue="0"/></label>
          <label>Included branches<input name="includedBranches" type="number" min="1" defaultValue="1"/></label><label>Extra branch fee<input name="additionalBranchFee" type="number" min="0" defaultValue="0"/></label>
          <label>Terminal fee<input name="terminalFee" type="number" min="0" defaultValue="0"/></label><label className="span-2">Description<textarea name="description" rows={2} placeholder="Approved package scope and commercial notes"/></label>
          <fieldset className="span-2 capability-fieldset"><legend>Default services</legend>{supportedServices.map(([value, label]) => <label key={value}><input type="checkbox" name="capabilities" value={value}/>{label}</label>)}</fieldset>
          <label className="span-2">Reason<input name="reason" required defaultValue="Approved package configuration"/></label><SubmitButton className="button span-2">Create package</SubmitButton>
        </MutationForm>
      </section>
    </div>
  </PlatformShell>
}
