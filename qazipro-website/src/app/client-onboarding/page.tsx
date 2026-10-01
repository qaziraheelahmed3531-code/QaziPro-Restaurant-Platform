import Link from "next/link"
import { ArrowUpRight } from "lucide-react"
import { ClientOnboardingForm } from "@/components/client-onboarding-form"
import { pageMetadata } from "@/lib/metadata"
import { getPublishedOnboardingForm } from "@/lib/platform-cms"

export const metadata = pageMetadata("Client Onboarding", "Submit a secure, signed QaziPro restaurant onboarding application and download the original agreement snapshot.", "/client-onboarding")
export const revalidate=60

export default async function ClientOnboarding() {
  const form=await getPublishedOnboardingForm()
  return <><section className="page-hero onboarding-page-hero"><div className="container"><span className="eyebrow">BECOMING A QAZIPRO CLIENT</span><h1>A professional start.<br/>One signed snapshot.</h1><p>Select real published services, review the configured commercial summary, sign, and receive a versioned PDF copy. Browser values never decide the final price.</p><Link className="button button-primary" href="#client-application">Start application <ArrowUpRight size={18}/></Link></div></section><section className="content-section onboarding-process"><div className="container"><div className="process-grid"><div><span>01</span><h3>Provide details</h3><p>Share the restaurant and authorized contact information.</p></div><div><span>02</span><h3>Select scope</h3><p>Choose from services and packages currently published by QaziPro.</p></div><div><span>03</span><h3>Review & sign</h3><p>Confirm the exact pricing and terms snapshot shown in the form.</p></div><div><span>04</span><h3>Keep a copy</h3><p>Download the original versioned PDF after successful submission.</p></div></div></div></section><section className="client-form-shell" id="client-application"><div className="container"><ClientOnboardingForm definition={form.definition} version={form.version} available={Boolean(form.id&&form.version>0)}/></div></section></>
}
