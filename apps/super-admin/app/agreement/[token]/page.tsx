import Image from "next/image"
import { notFound } from "next/navigation"
import { AgreementSignForm } from "@/components/agreement-sign-form"
import { getPublicAgreement } from "@/lib/agreement"

export default async function PublicAgreementPage({ params }: { params: Promise<{ token: string }> }) {
  const { token } = await params
  const agreement = await getPublicAgreement(token)
  if (!agreement) notFound()
  const details = agreement.details
  return <main className="agreement-page"><article className="agreement-document"><header><div className="agreement-brand"><Image src="/qazipro-logo.png" alt="QaziPro" width={58} height={58}/><div><strong>QaziPro</strong><span>Restaurant Platform</span></div></div><div className="agreement-version">Agreement {agreement.version}</div></header><section className="agreement-title"><p className="eyebrow">SECURE CLIENT ONBOARDING</p><h1>{agreement.businessName}</h1><p>Prepared for {agreement.ownerName}. This link expires {new Date(agreement.expiresAt).toLocaleString()}.</p></section><dl className="agreement-commercials"><div><dt>Package</dt><dd>{String(details.packageName ?? "Custom")}</dd></div><div><dt>Monthly charge</dt><dd>{Number(details.monthlyCharge ?? 0).toLocaleString()}</dd></div><div><dt>Setup charge</dt><dd>{Number(details.setupCharge ?? 0).toLocaleString()}</dd></div><div><dt>Branch charges</dt><dd>{Number(details.branchCharge ?? 0).toLocaleString()}</dd></div><div><dt>App charges</dt><dd>{Number(details.appCharge ?? 0).toLocaleString()}</dd></div><div><dt>QaziPro POC</dt><dd>{String(details.assignedPoc ?? "To be assigned")}</dd></div></dl><section className="agreement-notes"><h2>Commercial notes and exclusions</h2><p>{String(details.commercialNotes ?? "None recorded")}</p><p>{String(details.taxesAndExclusions ?? "None recorded")}</p></section><section className="legal-copy"><h2>Approved terms</h2><p>{agreement.legalText}</p></section><AgreementSignForm token={token} email={agreement.ownerEmail}/></article></main>
}
