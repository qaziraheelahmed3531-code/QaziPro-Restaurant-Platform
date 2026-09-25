"use client"

import { useActionState, useCallback, useMemo, useRef, useState } from "react"
import type { FormEvent } from "react"
import Link from "next/link"
import { provisionRestaurantAction, type ActionState } from "@/app/actions"
import { BranchLocationFields } from "@/components/branch-location-fields"
import { randomUUID } from "@/lib/browser-id"
import { appIdentifierPattern, onboardingFieldMessage, supportedServices } from "@/lib/onboarding"
import { Check, ChevronLeft, ChevronRight, Plus, Rocket, Trash2 } from "lucide-react"

export type OnboardingPackage = {
  id: string
  name: string
  code: string
  currency: string
  base_fee: number
  setup_fee: number
  included_branches: number
  billing_frequency: string
}

const initial: ActionState = {}
const steps = ["Business", "Services", "Commercials", "Brand & domains", "Branches & apps", "Review"]
const defaultServices = ["admin.restaurant", "pos.web", "pos.desktop", "website.ordering", "ordering.delivery", "ordering.pickup"]
type WizardControl = HTMLInputElement | HTMLSelectElement | HTMLTextAreaElement
type ValidationError = { field: string; message: string; step: number }
type ReviewData = { business: string; owner: string; services: string; package: string; commercials: string; domains: string; branches: string; apps: string }

export function OnboardingWizard({ packages, packageError }: { packages: OnboardingPackage[]; packageError?: string | null }) {
  const submissionLock = useRef(false)
  const [submissionStarted, setSubmissionStarted] = useState(false)
  const guardedAction = useCallback(async (previous: ActionState, form: FormData) => {
    try {
      return await provisionRestaurantAction(previous, form)
    } finally {
      submissionLock.current = false
      setSubmissionStarted(false)
    }
  }, [])
  const [state, action, pending] = useActionState(guardedAction, initial)
  const [step, setStep] = useState(0)
  const [branchCount, setBranchCount] = useState(1)
  const [selectedServices, setSelectedServices] = useState(() => new Set(defaultServices))
  const [selectedPackageId, setSelectedPackageId] = useState("")
  const [baseFee, setBaseFee] = useState(0)
  const [setupFee, setSetupFee] = useState(0)
  const [billingFrequency, setBillingFrequency] = useState("MONTHLY")
  const [review, setReview] = useState<ReviewData | null>(null)
  const [validationError, setValidationError] = useState<ValidationError | null>(null)
  const formRef = useRef<HTMLFormElement>(null)
  const requestKey = useMemo(() => randomUUID(), [])
  const submitting = pending || submissionStarted

  function controlsForStep(stepIndex: number) {
    const section = formRef.current?.querySelector<HTMLElement>(`[data-wizard-step="${stepIndex}"]`)
    return Array.from(section?.querySelectorAll<WizardControl>("input, select, textarea") ?? [])
  }

  function firstInvalidControl(stepIndex: number) {
    return controlsForStep(stepIndex).find((control) => !control.disabled && !control.checkValidity())
  }

  function showValidation(stepIndex: number, control: WizardControl, revealStep = false) {
    setValidationError({ field: control.name, message: onboardingFieldMessage(control.name, control.validationMessage), step: stepIndex })
    if (revealStep) setStep(stepIndex)
    requestAnimationFrame(() => {
      control.focus()
      control.reportValidity()
    })
  }

  function validateStep(stepIndex: number) {
    if (stepIndex === 2 && packages.length === 0) {
      setValidationError({ field: "packageId", message: packageError || "No active service packages are available.", step: stepIndex })
      return false
    }
    const invalid = firstInvalidControl(stepIndex)
    if (invalid) {
      showValidation(stepIndex, invalid)
      return false
    }
    setValidationError(null)
    return true
  }

  function continueToNextStep() {
    if (!validateStep(step)) return
    if (step === steps.length - 2) setReview(buildReview())
    setStep((value) => Math.min(steps.length - 1, value + 1))
  }

  function buildReview(): ReviewData {
    const form = formRef.current
    if (!form) return { business: "", owner: "", services: "", package: "", commercials: "", domains: "", branches: "", apps: "" }
    const values = new FormData(form)
    const packageValue = packages.find((item) => item.id === String(values.get("packageId") ?? ""))
    const branchNames = values.getAll("branchName").map(String).filter(Boolean)
    const enabledServices = values.getAll("services").map(String)
    const labels = new Map(supportedServices)
    return {
      business: `${values.get("name") || "—"} · ${values.get("city") || "—"}`,
      owner: `${values.get("ownerName") || "—"} · ${values.get("ownerEmail") || "—"}`,
      services: enabledServices.map((key) => labels.get(key as typeof supportedServices[number][0]) ?? key).join(", ") || "None selected",
      package: packageValue?.name ?? "Not selected",
      commercials: `${values.get("currency") || "PKR"} ${Number(values.get("baseFee") || 0).toLocaleString()} / ${String(values.get("billingFrequency") || "MONTHLY").toLowerCase()} · setup ${Number(values.get("setupFee") || 0).toLocaleString()}`,
      domains: [values.get("customerDomain"), values.get("adminDomain")].filter(Boolean).join(" · ") || "Configure later",
      branches: branchNames.join(", ") || "No branches",
      apps: [enabledServices.includes("mobile.android") ? values.get("androidId") || "Android ID missing" : null, enabledServices.includes("mobile.ios") ? values.get("iosId") || "iOS ID missing" : null].filter(Boolean).join(" · ") || "No mobile apps",
    }
  }

  function choosePackage(packageId: string) {
    setSelectedPackageId(packageId)
    const selected = packages.find((item) => item.id === packageId)
    if (!selected) return
    setBaseFee(selected.base_fee)
    setSetupFee(selected.setup_fee)
    setBillingFrequency(selected.billing_frequency)
  }

  function toggleService(key: string, enabled: boolean) {
    setSelectedServices((current) => {
      const next = new Set(current)
      if (enabled) next.add(key); else next.delete(key)
      return next
    })
  }

  function handleSubmit(event: FormEvent<HTMLFormElement>) {
    if (step < steps.length - 1) {
      event.preventDefault()
      continueToNextStep()
      return
    }
    for (let stepIndex = 0; stepIndex < steps.length - 1; stepIndex += 1) {
      const invalid = firstInvalidControl(stepIndex)
      if (invalid) {
        event.preventDefault()
        showValidation(stepIndex, invalid, true)
        return
      }
    }
    if (submissionLock.current) {
      event.preventDefault()
      return
    }
    submissionLock.current = true
    setSubmissionStarted(true)
    setValidationError(null)
  }

  function clearResolvedValidation(event: FormEvent<HTMLFormElement>) {
    const control = event.target as WizardControl
    if (validationError?.field === control.name && control.checkValidity()) setValidationError(null)
  }

  return <form ref={formRef} action={action} className="wizard" noValidate aria-busy={submitting} onSubmit={handleSubmit} onInput={clearResolvedValidation}>
    <input type="hidden" name="requestKey" value={requestKey}/>
    <ol className="wizard-steps">{steps.map((label,index) => <li key={label} className={index===step?"active":index<step?"done":""}><span>{index<step?<Check/>:index+1}</span><small>{label}</small></li>)}</ol>
    <div className="wizard-card">
      <section data-wizard-step="0" hidden={step!==0} className="form-section"><div className="section-heading"><p className="eyebrow">STEP 1</p><h2>Restaurant and owner</h2><p>Create the canonical business identity. The internal <code>business_id</code> is generated server-side.</p></div><div className="form-grid">
        <label>Brand name<input name="name" required minLength={2} placeholder="King's Cafe"/></label>
        <label>Public restaurant key<input name="slug" pattern="[a-z0-9]+(?:-[a-z0-9]+)*" placeholder="kings-cafe"/><small>Stable public key; never the private business ID.</small></label>
        <label>Legal name (optional)<input name="legalName"/></label>
        <label>Owner name<input name="ownerName" required minLength={2}/></label>
        <label>Owner email<input name="ownerEmail" type="email" required/><small>The owner receives an invitation; QaziPro never stores their password.</small></label>
        <label>Owner mobile<input name="ownerPhone" inputMode="tel"/></label>
        <label>City<input name="city" required defaultValue="Islamabad"/></label>
        <label>Country<select name="countryCode" defaultValue="PK"><option value="PK">Pakistan</option><option value="AE">United Arab Emirates</option><option value="GB">United Kingdom</option><option value="US">United States</option></select></label>
        <label>Currency<input name="currency" defaultValue="PKR" maxLength={3}/></label>
        <label>Timezone<input name="timezone" defaultValue="Asia/Karachi"/></label>
        <label className="span-2">Primary address<textarea name="address" rows={2}/></label>
      </div></section>
      <section data-wizard-step="1" hidden={step!==1} className="form-section"><div className="section-heading"><p className="eyebrow">STEP 2</p><h2>Services and entitlements</h2><p>Choose only the services this restaurant will use. Runtime enforcement remains server-authoritative.</p></div><div className="service-grid">{supportedServices.map(([value,label])=><label className="service-option" key={value}><input type="checkbox" name="services" value={value} checked={selectedServices.has(value)} onChange={(event)=>toggleService(value,event.target.checked)}/><span><Check/>{label}</span></label>)}</div></section>
      <section data-wizard-step="2" hidden={step!==2} className="form-section"><div className="section-heading"><p className="eyebrow">STEP 3</p><h2>Package and commercials</h2><p>Pricing is configuration, not hardcoded product logic.</p></div><div className="form-grid">
        <label className="span-2">Service package<select name="packageId" required value={selectedPackageId} disabled={packages.length===0} onChange={(event)=>choosePackage(event.target.value)} aria-invalid={validationError?.field==="packageId"} aria-describedby={validationError?.field==="packageId"?"packageId-error":undefined}><option value="" disabled>{packages.length?"Select an active package":"No active service packages are available"}</option>{packages.map((item)=><option value={item.id} key={item.id}>{item.name} · {item.currency} {item.base_fee.toLocaleString()}/{item.billing_frequency.toLowerCase()} · setup {item.setup_fee.toLocaleString()}</option>)}</select>{validationError?.field==="packageId"?<small id="packageId-error" className="inline-field-error" role="alert">{validationError.message}</small>:null}{packages.length===0?<small className="package-empty-state">No active service packages are available. <Link href="/packages">Manage service packages</Link>.</small>:null}</label>
        <label>Monthly/base fee<input name="baseFee" type="number" min="0" value={baseFee} onChange={(event)=>setBaseFee(Math.max(0,Number(event.target.value)||0))}/></label><label>Setup fee<input name="setupFee" type="number" min="0" value={setupFee} onChange={(event)=>setSetupFee(Math.max(0,Number(event.target.value)||0))}/></label>
        <label>Billing frequency<select name="billingFrequency" value={billingFrequency} onChange={(event)=>setBillingFrequency(event.target.value)}><option>MONTHLY</option><option>QUARTERLY</option><option>ANNUAL</option><option>CUSTOM</option></select></label>
        <label className="span-2">Commercial notes<textarea name="commercialNotes" rows={4} placeholder="Approved discounts, exclusions and internal commercial context"/></label>
      </div></section>
      <section data-wizard-step="3" hidden={step!==3} className="form-section"><div className="section-heading"><p className="eyebrow">STEP 4</p><h2>Brand and domains</h2><p>All clients load branding from the restaurant configuration.</p></div><div className="form-grid">
        <label>Primary colour<input name="primaryColor" type="color" defaultValue="#a92114"/></label><label>Secondary colour<input name="secondaryColor" type="color" defaultValue="#e7a81a"/></label>
        <label className="span-2">Logo URL<input name="logoUrl" type="url" placeholder="Secure storage URL (optional during onboarding)"/></label>
        <label>Customer domain<input name="customerDomain" placeholder="orders.restaurant.com"/></label><label>Admin domain<input name="adminDomain" placeholder="admin.restaurant.com"/></label>
        <p className="form-help span-2">DNS, SSL and Auth callback status remain UNKNOWN until verified by a real health check.</p>
      </div></section>
      <section data-wizard-step="4" hidden={step!==4} className="form-section"><div className="section-heading"><p className="eyebrow">STEP 5</p><h2>Branches and app identities</h2><p>Add the first operating locations. Delivery remains disabled until location and delivery rules are verified.</p></div><div className="branch-stack">{Array.from({length:branchCount},(_,index)=><fieldset key={index}><legend>Branch {index+1}</legend><div className="form-grid"><label>Branch name<input name="branchName" required placeholder={index===0?"Islamabad":"Lahore"}/></label><label>Branch code<input name="branchCode" required defaultValue={`B${index+1}`}/></label><BranchLocationFields prefix="branch" index={index}/></div>{branchCount>1?<button type="button" className="text-button danger" onClick={()=>setBranchCount((value)=>Math.max(1,value-1))}><Trash2/>Remove last branch</button>:null}</fieldset>)}</div><button type="button" className="button button-secondary" onClick={()=>setBranchCount((value)=>Math.min(20,value+1))}><Plus/>Add another branch</button>{selectedServices.has("ordering.delivery")?<p className="form-help">Delivery service is requested. Each new branch starts with delivery safely disabled until its location and delivery rules are reviewed.</p>:null}<div className="form-grid app-identifiers">{selectedServices.has("mobile.android")?<><label>Android app name<input name="androidName" required/></label><label>Android package ID<input name="androidId" required pattern={appIdentifierPattern.source} placeholder="com.qazipro.restaurant"/></label></>:null}{selectedServices.has("mobile.ios")?<><label>iOS app name<input name="iosName" required/></label><label>iOS bundle ID<input name="iosId" required pattern={appIdentifierPattern.source} placeholder="com.qazipro.restaurant"/></label></>:null}</div></section>
      <section data-wizard-step="5" hidden={step!==5} className="form-section review-section"><div className="review-icon"><Rocket/></div><div className="section-heading"><p className="eyebrow">FINAL REVIEW</p><h2>Provision safely</h2><p>This creates one canonical restaurant and all supported linked records in one retry-safe audited transaction.</p></div>{review?<dl className="review-summary"><dt>Business</dt><dd>{review.business}</dd><dt>Owner</dt><dd>{review.owner}</dd><dt>Services</dt><dd>{review.services}</dd><dt>Package</dt><dd>{review.package}</dd><dt>Commercials</dt><dd>{review.commercials}</dd><dt>Domains</dt><dd>{review.domains}</dd><dt>Branches</dt><dd>{review.branches}</dd><dt>Apps</dt><dd>{review.apps}</dd></dl>:null}<div className="review-edit-links">{steps.slice(0,5).map((label,index)=><button type="button" key={label} onClick={()=>setStep(index)}>Edit {label}</button>)}</div><ul><li><Check/>Retry-safe request key</li><li><Check/>Restaurant inactive until lifecycle activation</li><li><Check/>Delivery disabled until rules are verified</li><li><Check/>Domains and apps start pending</li></ul></section>
      {validationError&&validationError.field!=="packageId"?<div className="form-error wizard-validation-error" role="alert"><strong>Complete this step before continuing.</strong><span>{validationError.message}</span></div>:null}
      {state.error?<div className="form-error" role="alert"><strong>Provisioning stopped safely.</strong><span>{state.error}</span><small>Request ID: {state.requestId}</small></div>:null}
      <footer className="wizard-actions"><button className="button button-secondary" type="button" disabled={step===0||submitting} onClick={()=>{setValidationError(null);setStep((value)=>Math.max(0,value-1))}}><ChevronLeft/>Back</button>{step<steps.length-1?<button className="button" type="button" disabled={submitting} onClick={continueToNextStep}>Continue<ChevronRight/></button>:<button className="button" type="submit" disabled={submitting}>{submitting?"Provisioning…":"Provision restaurant"}<Rocket/></button>}</footer>
    </div>
  </form>
}
