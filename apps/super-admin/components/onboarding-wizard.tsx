"use client"

import { useActionState, useMemo, useState } from "react"
import { randomUUID } from "@/lib/browser-id"
import { provisionRestaurantAction, type ActionState } from "@/app/actions"
import { Check, ChevronLeft, ChevronRight, Plus, Rocket, Trash2 } from "lucide-react"

export type OnboardingPackage = { id: string; name: string; code: string; currency: string; base_fee: number; setup_fee: number; included_branches: number; billing_frequency: string }
const initial: ActionState = {}
const steps = ["Business", "Services", "Commercials", "Brand & domains", "Branches & apps", "Review"]
const services = [
  ["admin.restaurant", "Restaurant Admin"], ["pos.web", "Web POS"], ["pos.desktop", "Desktop POS"],
  ["inventory", "Inventory"], ["kitchen", "Kitchen / KDS"], ["waiter", "Waiter"], ["rider", "Rider"],
  ["website.ordering", "Online Ordering Website"], ["ordering.delivery", "Delivery Orders"], ["ordering.pickup", "Pickup Orders"], ["loyalty", "Loyalty"], ["reports.advanced", "Advanced Reports"],
  ["mobile.android", "Android App"], ["mobile.ios", "iOS App"],
]

export function OnboardingWizard({ packages }: { packages: OnboardingPackage[] }) {
  const [state, action, pending] = useActionState(provisionRestaurantAction, initial)
  const [step, setStep] = useState(0)
  const [branchCount, setBranchCount] = useState(1)
  const requestKey = useMemo(() => randomUUID(), [])
  return <form action={action} className="wizard">
    <input type="hidden" name="requestKey" value={requestKey}/>
    <ol className="wizard-steps">{steps.map((label,index) => <li key={label} className={index===step?"active":index<step?"done":""}><span>{index<step?<Check/>:index+1}</span><small>{label}</small></li>)}</ol>
    <div className="wizard-card">
      <section hidden={step!==0} className="form-section"><div className="section-heading"><p className="eyebrow">STEP 1</p><h2>Restaurant and owner</h2><p>Create the canonical business identity. The internal <code>business_id</code> is generated server-side.</p></div><div className="form-grid">
        <label>Brand name<input name="name" required minLength={2} placeholder="King's Cafe"/></label>
        <label>Public restaurant key<input name="slug" pattern="[a-z0-9]+(?:-[a-z0-9]+)*" placeholder="kings-cafe"/><small>Stable public key; never the private business ID.</small></label>
        <label>Legal name (optional)<input name="legalName"/></label>
        <label>Owner name<input name="ownerName" required/></label>
        <label>Owner email<input name="ownerEmail" type="email" required/><small>The owner receives an invitation; QaziPro never stores their password.</small></label>
        <label>Owner mobile<input name="ownerPhone" inputMode="tel"/></label>
        <label>City<input name="city" required defaultValue="Islamabad"/></label>
        <label>Country<select name="countryCode" defaultValue="PK"><option value="PK">Pakistan</option><option value="AE">United Arab Emirates</option><option value="GB">United Kingdom</option><option value="US">United States</option></select></label>
        <label>Currency<input name="currency" defaultValue="PKR" maxLength={3}/></label>
        <label>Timezone<input name="timezone" defaultValue="Asia/Karachi"/></label>
        <label className="span-2">Primary address<textarea name="address" rows={2}/></label>
      </div></section>
      <section hidden={step!==1} className="form-section"><div className="section-heading"><p className="eyebrow">STEP 2</p><h2>Services and entitlements</h2><p>Capabilities are stored centrally and enforced independently from navigation visibility.</p></div><div className="service-grid">{services.map(([value,label])=><label className="service-option" key={value}><input type="checkbox" name="services" value={value} defaultChecked={["admin.restaurant","pos.web","pos.desktop","website.ordering","ordering.delivery","ordering.pickup"].includes(value)}/><span><Check/>{label}</span></label>)}</div></section>
      <section hidden={step!==2} className="form-section"><div className="section-heading"><p className="eyebrow">STEP 3</p><h2>Package and commercials</h2><p>Pricing is configuration, not hardcoded product logic.</p></div><div className="form-grid">
        <label className="span-2">Service package<select name="packageId" required defaultValue=""><option value="" disabled>Select an active package</option>{packages.map((item)=><option value={item.id} key={item.id}>{item.name} · {item.currency} {item.base_fee.toLocaleString()}/{item.billing_frequency.toLowerCase()}</option>)}</select></label>
        <label>Monthly/base fee<input name="baseFee" type="number" min="0" defaultValue="0"/></label><label>Setup fee<input name="setupFee" type="number" min="0" defaultValue="0"/></label>
        <label>Billing frequency<select name="billingFrequency"><option>MONTHLY</option><option>QUARTERLY</option><option>ANNUAL</option><option>CUSTOM</option></select></label>
        <label className="span-2">Commercial notes<textarea name="commercialNotes" rows={4} placeholder="Approved discounts, exclusions and internal commercial context"/></label>
      </div></section>
      <section hidden={step!==3} className="form-section"><div className="section-heading"><p className="eyebrow">STEP 4</p><h2>Brand and domains</h2><p>All clients load branding from the restaurant configuration.</p></div><div className="form-grid">
        <label>Primary colour<input name="primaryColor" type="color" defaultValue="#a92114"/></label><label>Secondary colour<input name="secondaryColor" type="color" defaultValue="#e7a81a"/></label>
        <label className="span-2">Logo URL<input name="logoUrl" type="url" placeholder="Secure storage URL (optional during onboarding)"/></label>
        <label>Customer domain<input name="customerDomain" placeholder="orders.restaurant.com"/></label><label>Admin domain<input name="adminDomain" placeholder="admin.restaurant.com"/></label>
        <p className="form-help span-2">DNS, SSL and Auth callback status remain UNKNOWN until verified by a real health check.</p>
      </div></section>
      <section hidden={step!==4} className="form-section"><div className="section-heading"><p className="eyebrow">STEP 5</p><h2>Branches and app identities</h2><p>Add initial locations. More branches remain centrally manageable.</p></div><div className="branch-stack">{Array.from({length:branchCount},(_,index)=><fieldset key={index}><legend>Branch {index+1}</legend><div className="form-grid"><label>Branch name<input name="branchName" required placeholder={index===0?"Islamabad":"Lahore"}/></label><label>Branch code<input name="branchCode" required defaultValue={`B${index+1}`}/></label><label className="span-2">Branch address<input name={`branchAddress${index}`}/></label></div>{branchCount>1?<button type="button" className="text-button danger" onClick={()=>setBranchCount((value)=>Math.max(1,value-1))}><Trash2/>Remove last branch</button>:null}</fieldset>)}</div><button type="button" className="button button-secondary" onClick={()=>setBranchCount((value)=>Math.min(20,value+1))}><Plus/>Add another branch</button><label className="check-row"><input name="deliveryEnabled" type="checkbox" defaultChecked/>Enable delivery after branch location/rules are configured</label><div className="form-grid app-identifiers"><label>Android app name<input name="androidName"/></label><label>Android package ID<input name="androidId" placeholder="com.qazipro.restaurant"/></label><label>iOS app name<input name="iosName"/></label><label>iOS bundle ID<input name="iosId" placeholder="com.qazipro.restaurant"/></label></div></section>
      <section hidden={step!==5} className="form-section review-section"><div className="review-icon"><Rocket/></div><div className="section-heading"><p className="eyebrow">FINAL REVIEW</p><h2>Provision safely</h2><p>This creates one canonical restaurant, its branches, commercial record, service entitlements, app registry and domain checks in one audited transaction.</p></div><ul><li><Check/>Retry-safe request key</li><li><Check/>Restaurant inactive until lifecycle activation</li><li><Check/>No owner password handled by QaziPro</li><li><Check/>All app and domain health starts UNKNOWN/PENDING</li></ul></section>
      {state.error?<div className="form-error" role="alert"><strong>Provisioning stopped safely.</strong><span>{state.error}</span><small>Request ID: {state.requestId}</small></div>:null}
      <footer className="wizard-actions"><button className="button button-secondary" type="button" disabled={step===0||pending} onClick={()=>setStep((value)=>Math.max(0,value-1))}><ChevronLeft/>Back</button>{step<steps.length-1?<button className="button" type="button" onClick={()=>setStep((value)=>Math.min(steps.length-1,value+1))}>Continue<ChevronRight/></button>:<button className="button" disabled={pending}>{pending?"Provisioning…":"Provision restaurant"}<Rocket/></button>}</footer>
    </div>
  </form>
}
