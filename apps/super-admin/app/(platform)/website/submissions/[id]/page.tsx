import Image from "next/image"
import Link from "next/link"
import { ArrowLeft,Download,FileSignature } from "lucide-react"
import { notFound } from "next/navigation"
import { requirePlatformPermission } from "@/lib/auth"
import { createClient } from "@/lib/supabase/server"
import { PlatformShell } from "@/components/platform-shell"
import { MutationForm } from "@/components/mutation-form"
import { SubmitButton } from "@/components/submit-button"
import { PageHeader,StatusBadge } from "@/components/ui"
import { updateSubmissionAction } from "../../actions"

type Row=Record<string,unknown>
export default async function SubmissionDetail({params}:{params:Promise<{id:string}>}) {
  const {id}=await params
  const context=await requirePlatformPermission("website.manage")
  const client=await createClient()
  const [submission,activity,staff]=await Promise.all([
    client.from("platform_onboarding_submissions").select("*").eq("id",id).maybeSingle(),
    client.from("platform_onboarding_submission_activity").select("*").eq("submission_id",id).order("created_at",{ascending:false}),
    client.from("platform_staff").select("user_id,display_name,email").eq("status","ACTIVE").order("display_name"),
  ])
  if(!submission.data)notFound()
  const row=submission.data as Row,values=(row.client_data??{}) as Record<string,unknown>,pricing=(row.pricing_snapshot??{}) as Record<string,unknown>,services=Array.isArray(row.selected_services)?row.selected_services as Row[]:[],terms=Array.isArray(row.terms_snapshot)?row.terms_snapshot as Row[]:[]
  return <PlatformShell context={context}><Link className="text-link" href="/website#submissions"><ArrowLeft/> Back to submissions</Link><PageHeader eyebrow="SIGNED CLIENT SNAPSHOT" title={String(row.reference)} description="Original submitted values and PDF are immutable. Internal status, assignment and notes remain auditable." actions={<a className="button" href={`/website/submissions/${id}/pdf`}><Download/> Download PDF</a>}/><div className="submission-detail-grid"><section className="panel"><header><div><p className="eyebrow">CLIENT INFORMATION</p><h2>{String(values.restaurantName??"Onboarding application")}</h2></div><StatusBadge value={row.status}/></header><dl className="submission-values">{Object.entries(values).map(([key,value])=><div key={key}><dt>{key.replace(/([A-Z])/g," $1")}</dt><dd>{String(value)}</dd></div>)}</dl></section><section className="panel"><header><div><p className="eyebrow">COMMERCIAL SNAPSHOT</p><h2>Published form v{String(row.form_version)}</h2></div><FileSignature/></header><h3>Services</h3><ul>{services.map(item=><li key={String(item.id)}>{String(item.name)}</li>)}</ul><h3>Pricing</h3><dl className="submission-values"><div><dt>Monthly</dt><dd>{pricing.hasQuotedPrice?`${pricing.currency} ${Number(pricing.monthly).toLocaleString()}`:"Custom quote"}</dd></div><div><dt>Setup</dt><dd>{pricing.hasQuotedPrice?`${pricing.currency} ${Number(pricing.setup).toLocaleString()}`:"To be confirmed"}</dd></div><div><dt>Location</dt><dd>{pricing.hasQuotedPrice?`${pricing.currency} ${Number(pricing.locationFee).toLocaleString()}`:"To be confirmed"}</dd></div></dl><h3>Terms</h3><ul>{terms.map(item=><li key={String(item.id)}>{String(item.text)}</li>)}</ul></section><section className="panel"><header><div><p className="eyebrow">SIGNATURE</p><h2>Original client mark</h2></div></header><Image className="submission-signature" src={String(row.signature_data)} alt="Client signature submitted with this application" width={900} height={220} unoptimized/><p className="muted">Consent recorded {new Date(String(row.consented_at)).toLocaleString()}. Signature hash: {String(row.signature_hash).slice(0,16)}…</p></section><section className="panel"><header><div><p className="eyebrow">INTERNAL WORKFLOW</p><h2>Review and assignment</h2></div></header><MutationForm action={updateSubmissionAction} className="form-grid"><input type="hidden" name="id" value={id}/><label>Status<select name="status" defaultValue={String(row.status)}>{["NEW","REVIEWING","NEEDS_INFO","APPROVED","REJECTED","CONVERTED"].map(value=><option key={value}>{value}</option>)}</select></label><label>Assigned POC<select name="assigned" defaultValue={String(row.assigned_staff_user_id??"")}><option value="">Unassigned</option>{staff.data?.map(item=><option key={item.user_id} value={item.user_id}>{item.display_name} ({item.email})</option>)}</select></label><label className="span-2">Internal notes<textarea name="notes" rows={5} defaultValue={String(row.internal_notes??"")}/></label><SubmitButton className="button span-2">Save internal update</SubmitButton></MutationForm></section><section className="panel span-two"><header><div><p className="eyebrow">ACTIVITY</p><h2>Submission history</h2></div></header><div className="record-list">{activity.data?.map((item:Row)=><div className="record-row" key={String(item.id)}><div><strong>{String(item.action).replaceAll("_"," ")}</strong><small>{String(item.detail)}</small></div><time>{new Date(String(item.created_at)).toLocaleString()}</time></div>)}</div></section></div></PlatformShell>
}
