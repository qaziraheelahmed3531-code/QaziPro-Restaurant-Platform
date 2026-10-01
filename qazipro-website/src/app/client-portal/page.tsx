import type { Metadata } from "next"
import Link from "next/link"
import { ArrowLeft, LockKeyhole } from "lucide-react"
import { redirect } from "next/navigation"
import { PortalLoginForm } from "@/components/portal-login-form"
import { getPortalSession } from "@/lib/client-portal"

export const metadata:Metadata={title:"Client Portal",description:"Securely follow your QaziPro onboarding application, documents and requested information.",robots:{index:false,follow:false}}

export default async function ClientPortalLogin({searchParams}:{searchParams:Promise<{reference?:string;email?:string}>}){
  const [session,query]=await Promise.all([getPortalSession(),searchParams])
  if(session)redirect("/client-portal/dashboard")
  return <section className="portal-login-page"><div className="portal-ambient portal-ambient-one"/><div className="portal-ambient portal-ambient-two"/><div className="container portal-login-layout"><div className="portal-login-copy"><Link href="/" className="portal-back"><ArrowLeft size={16}/> Back to QaziPro.com</Link><span className="portal-security-label"><LockKeyhole size={16}/> Private and passwordless</span><h2>From signed application to restaurant launch.</h2><p>Track status, keep your agreement, answer information requests and share required documents in one secure place.</p><ul><li>Your signed commercial snapshot stays unchanged.</li><li>Only the verified application email can sign in.</li><li>Internal QaziPro notes never appear here.</li></ul></div><PortalLoginForm defaultReference={String(query.reference||"").toUpperCase()} defaultEmail={String(query.email||"").toLowerCase()}/></div></section>
}
