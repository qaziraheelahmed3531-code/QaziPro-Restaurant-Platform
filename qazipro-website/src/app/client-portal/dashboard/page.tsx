import type { Metadata } from "next"
import Link from "next/link"
import { ArrowRight, CalendarDays, FileCheck2, LogOut, Plus } from "lucide-react"
import { redirect } from "next/navigation"
import { logoutPortalAction } from "../actions"
import { PortalMotion } from "@/components/portal-motion"
import { getPortalApplications, getPortalSession, portalStatusCopy } from "@/lib/client-portal"

export const metadata:Metadata={title:"Applications | Client Portal",robots:{index:false,follow:false}}

export default async function PortalDashboard(){
  const [session,applications]=await Promise.all([getPortalSession(),getPortalApplications()])
  if(!session)redirect("/client-portal")
  return <section className="portal-page"><div className="container portal-shell"><header className="portal-shell-header"><div><span className="eyebrow">QAZIPRO CLIENT PORTAL</span><h1>Your applications</h1><p>Signed agreements, current review status and the next action.</p></div><form action={logoutPortalAction}><button className="portal-logout"><LogOut size={16}/> Sign out</button></form></header>{applications?.length?<div className="portal-application-grid">{applications.map((application,index)=>{const status=portalStatusCopy[application.status];return <PortalMotion key={application.id} delay={index*.04}><Link className="portal-application-card" href={`/client-portal/${application.reference}`}><div className="portal-card-top"><span className={`portal-status portal-status-${application.status.toLowerCase()}`}>{status.label}</span><ArrowRight/></div><h2>{application.restaurantName}</h2><code>{application.reference}</code><div className="portal-card-meta"><span><CalendarDays/> Submitted {new Date(application.createdAt).toLocaleDateString()}</span><span><FileCheck2/> {application.serviceCount} selected service{application.serviceCount===1?"":"s"}</span></div><strong>Open application <ArrowRight/></strong></Link></PortalMotion>})}</div>:<PortalMotion className="portal-empty"><FileCheck2/><h2>No applications found</h2><p>Sign in using the exact email stored on your submitted application.</p><Link className="button button-primary" href="/client-onboarding"><Plus/> Start an application</Link></PortalMotion>}</div></section>
}
