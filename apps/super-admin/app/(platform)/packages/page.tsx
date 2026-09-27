import { MutationForm } from "@/components/mutation-form"
import { SubmitButton } from "@/components/submit-button"
import { PackagePlus } from "lucide-react"
import { createServicePackageAction, setServicePackageStatusAction, updateServicePackageAction } from "@/app/actions"
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
    {notice.updated ? <div className="success-banner">Package updated and audited.</div> : null}
    {errorMessage ? <div className="form-error">{errorMessage}</div> : null}
    <div className="workspace-grid">
      <section className="panel">
        <header><div><p className="eyebrow">PACKAGE CATALOG</p><h2>Configured packages</h2></div></header>
        {result.data.length ? <div className="record-list">{result.data.map((row) => <article className="record-row record-row-stack" key={String(row.id)}>
          <div><strong>{String(row.name)} · {String(row.code)}</strong><small>{String(row.currency)} {Number(row.base_fee ?? 0).toLocaleString()} / {String(row.billing_frequency).toLowerCase()} · {String(row.included_branches)} branches included</small></div>
          <StatusBadge value={row.is_active ? "ACTIVE" : "INACTIVE"}/>
          <p className="form-help">{Number((row.restaurant_subscriptions as {count:number}[]|undefined)?.[0]?.count ?? 0)} restaurant subscriptions reference this package. Current subscription fees and service access are preserved when editing this commercial template.</p>
          {context.permissions.includes("subscriptions.manage") ? <details className="inline-create"><summary>Edit commercial template</summary>
            <MutationForm action={updateServicePackageAction} className="form-grid compact-form">
              <input type="hidden" name="packageId" value={String(row.id)}/><input type="hidden" name="updatedAt" value={String(row.updated_at)}/>
              <label>Display name<input name="name" minLength={2} maxLength={100} required defaultValue={String(row.name)}/></label>
              <label>Currency<input name="currency" required pattern="[A-Z]{3}" maxLength={3} defaultValue={String(row.currency)}/></label>
              <label>Billing<select name="billingFrequency" defaultValue={String(row.billing_frequency)}>{["MONTHLY","QUARTERLY","ANNUAL","CUSTOM"].map(value=><option key={value}>{value}</option>)}</select></label>
              {([["baseFee","Base fee","base_fee"],["setupFee","Setup fee","setup_fee"],["includedBranches","Included branches","included_branches"],["additionalBranchFee","Extra branch fee","additional_branch_fee"],["terminalFee","Terminal fee","terminal_fee"]] as const).map(([name,label,column])=><label key={name}>{label}<input name={name} type="number" step={1} min={name==="includedBranches"?1:0} max={2147483647} required defaultValue={Number(row[column])}/></label>)}
              <label className="span-2">Description<textarea name="description" maxLength={2000} defaultValue={String(row.description ?? "")}/></label>
              <label className="span-2">Audit reason<input name="reason" minLength={3} maxLength={500} required placeholder="Why is this template changing?"/></label>
              <p className="form-help span-2">Service defaults and package code stay unchanged. Manage restaurant-specific fees in Billing and access in Services.</p>
              <SubmitButton className="button span-2">Save package</SubmitButton>
            </MutationForm>
          </details> : null}
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
