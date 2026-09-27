import { MutationForm } from "@/components/mutation-form"
import { SubmitButton } from "@/components/submit-button"
import Link from "next/link"
import { ArrowLeft, CheckCircle2, FileSignature, ShieldCheck } from "lucide-react"
import { approveAgreementAction, createAgreementAction } from "@/app/actions"
import { PlatformShell } from "@/components/platform-shell"
import { DataNotice, EmptyState, PageHeader, StatusBadge } from "@/components/ui"
import { CopyLinkButton } from "@/components/copy-link-button"
import { requirePlatformStaff } from "@/lib/auth"
import { getOnboardingAgreement } from "@/lib/data"
import { getPlatformPublicOrigin } from "@/lib/public-origin"

type Row = Record<string, unknown>

export default async function AgreementPage({ params, searchParams }: { params: Promise<{ id: string }>; searchParams: Promise<{ created?: string; approved?: string; share?: string; error?: string }> }) {
  const context = await requirePlatformStaff()
  const { id } = await params
  const notice = await searchParams
  const result = await getOnboardingAgreement(id)
  if (!result.data) return <PlatformShell context={context}><Link className="back-link" href="/onboarding"><ArrowLeft/>Onboarding</Link><DataNotice message={result.error ?? "Onboarding record was not found."}/></PlatformShell>
  const onboarding = result.data.onboarding
  const business = onboarding.businesses as Row | null
  const subscription = result.data.subscription
  const packageValue = subscription?.service_packages as Row | null
  const publicBase = getPlatformPublicOrigin()
  const shareUrl = notice.share ? `${publicBase}/agreement/${notice.share}` : ""
  return <PlatformShell context={context}>
    <Link className="back-link" href="/onboarding"><ArrowLeft/>Onboarding queue</Link>
    <PageHeader eyebrow="CLIENT AGREEMENT" title={String(business?.name ?? onboarding.owner_name)} description="Legal copy is always supplied by QaziPro and remains versioned; the platform does not invent terms." actions={<StatusBadge value={onboarding.lifecycle}/>}/>
    {result.error ? <DataNotice message={result.error}/> : null}
    {notice.created && shareUrl ? <section className="share-banner"><ShieldCheck/><div><strong>Secure link created - copy it now</strong><p>This one-time signing link expires in seven days and is never stored in plain text.</p><code>{shareUrl}</code></div><CopyLinkButton value={shareUrl}/></section> : null}
    {notice.approved ? <div className="success-banner"><CheckCircle2/>Signed agreement approved and audited.</div> : null}
    {notice.error ? <div className="form-error">Agreement action was rejected safely ({notice.error}).</div> : null}
    <div className="workspace-grid">
      <section className="panel"><header><div><p className="eyebrow">NEW VERSION</p><h2>Create secure client agreement</h2></div><FileSignature/></header><MutationForm action={createAgreementAction} className="form-grid compact-form"><input type="hidden" name="onboardingId" value={id}/><label>Terms version<input name="version" required placeholder="2026-09-v1"/></label><label>Package<input name="packageName" defaultValue={String(packageValue?.name ?? "Custom")}/></label><label>Monthly charge<input type="number" min="0" name="monthlyCharge" defaultValue={Number(subscription?.base_fee ?? 0)}/></label><label>Setup charge<input type="number" min="0" name="setupCharge" defaultValue={Number(subscription?.setup_fee ?? 0)}/></label><label>Branch charges<input type="number" min="0" name="branchCharge" defaultValue={Number(subscription?.branch_fee ?? 0)}/></label><label>App charges<input type="number" min="0" name="appCharge" defaultValue={Number(subscription?.android_fee ?? 0) + Number(subscription?.ios_fee ?? 0)}/></label><label className="span-2">Taxes and exclusions<textarea name="taxesAndExclusions" rows={2}/></label><label>QaziPro assigned POC<input name="assignedPoc" defaultValue={context.displayName}/></label><label>Audit reason<input name="reason" required defaultValue="Client onboarding agreement issued"/></label><label className="span-2">Commercial notes<textarea name="commercialNotes" rows={3} defaultValue={String(onboarding.commercial_notes ?? "")}/></label><label className="span-2">Approved legal text<textarea name="legalText" rows={10} minLength={20} required placeholder="Paste legal-approved QaziPro agreement terms here. Do not use placeholder text for a real client."/></label><SubmitButton className="button span-2">Generate secure signing link</SubmitButton></MutationForm></section>
      <section className="panel"><header><div><p className="eyebrow">VERSION HISTORY</p><h2>Agreement records</h2></div></header>{result.data.documents.length ? <div className="record-list">{result.data.documents.map((document) => <div className="record-row record-row-stack" key={String(document.id)}><div><strong>Version {String(document.version)}</strong><small>{new Date(String(document.created_at)).toLocaleString()} · {document.signer_name ? `Signed by ${String(document.signer_name)}` : "Awaiting client"}</small></div><StatusBadge value={document.status}/>{document.status === "SIGNED" ? <MutationForm action={approveAgreementAction}><input type="hidden" name="documentId" value={String(document.id)}/><input type="hidden" name="onboardingId" value={id}/><input type="hidden" name="reason" value="Signed client agreement reviewed"/><SubmitButton className="button button-small">Approve</SubmitButton></MutationForm> : null}</div>)}</div> : <EmptyState title="No agreement versions" detail="Create a version only after approved legal text and commercials are ready."/>}</section>
    </div>
  </PlatformShell>
}
