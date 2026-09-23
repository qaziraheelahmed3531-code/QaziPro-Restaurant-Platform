"use client";

import { usePathname, useSearchParams } from "next/navigation";
import { useState, type FormEvent } from "react";
import { ArrowRight, CircleCheck, LoaderCircle } from "lucide-react";
import { serviceKeys, type LeadInput } from "@/lib/lead-schema";

const labels: Record<(typeof serviceKeys)[number], string> = {
  RESTAURANT_POS: "Restaurant POS", ONLINE_ORDERING: "Online ordering", WEBSITE: "Restaurant website", ANDROID: "Android app", IOS: "iOS app", INVENTORY: "Inventory", KITCHEN: "Kitchen / KDS", MULTI_BRANCH: "Multi-branch", SHOPIFY: "Shopify", SHOPIFY_THEME: "Custom Shopify theme", FULL_STACK: "Custom software", OTHER: "Other",
};
type Kind = LeadInput["kind"];
const copy: Record<Kind, { title: string; detail: string; button: string }> = {
  CONTACT: { title: "Send us a message", detail: "Tell us what you have in mind. We'll get back to you on your preferred contact channel.", button: "Send message" },
  DEMO: { title: "Book a product conversation", detail: "Share a little about your restaurant so we can show the parts that matter to you.", button: "Request a demo" },
  QUOTE: { title: "Tell us about your project", detail: "We'll review the scope before talking numbers—no generic price calculator.", button: "Request a quote" },
  ONBOARDING: { title: "Start with your business", detail: "We'll review your needs and issue any approved agreement through a secure private link.", button: "Begin onboarding" },
};

export function LeadForm({ kind }: { kind: Kind }) {
  const path = usePathname();
  const params = useSearchParams();
  const [selected, setSelected] = useState<Array<(typeof serviceKeys)[number]>>([]);
  const [status, setStatus] = useState<"idle" | "sending" | "success" | "error">("idle");
  const [message, setMessage] = useState("");
  const [startedAt] = useState(() => Date.now());
  const content = copy[kind];
  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setStatus("sending"); setMessage("");
    const formElement = event.currentTarget;
    const form = new FormData(formElement);
    const text = (key: string) => String(form.get(key) ?? "").trim();
    const data = { kind, fullName: text("fullName"), businessName: text("businessName"), email: text("email"), phone: text("phone"), branchBand: text("branchBand"), services: selected, message: text("message"), preferredContactTime: text("preferredContactTime"), preferredContactMethod: text("preferredContactMethod"), budgetRange: text("budgetRange"), sourcePage: path, website: text("website"), startedAt, utmSource: params.get("utm_source") ?? "", utmMedium: params.get("utm_medium") ?? "", utmCampaign: params.get("utm_campaign") ?? "" };
    try {
      const response = await fetch("/api/leads", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(data) });
      const result = await response.json() as { message?: string };
      if (!response.ok) throw new Error(result.message || "We couldn&apos;t send your request. Please try again.");
      setStatus("success");
      formElement.reset(); setSelected([]);
    } catch (error) { setStatus("error"); setMessage(error instanceof Error ? error.message : "Please try again."); }
  }
  if (status === "success") return <div className="form-success" role="status"><CircleCheck size={29}/><h3>Request received.</h3><p>Thank you for reaching out. The QaziPro team will review your message and get in touch.</p></div>;
  return <form className="lead-form" onSubmit={submit}><h2>{content.title}</h2><p>{content.detail}</p>
    <label>Full name *<input name="fullName" type="text" autoComplete="name" minLength={2} maxLength={100} required placeholder="Your name"/></label>
    <label>Business / brand name *<input name="businessName" type="text" autoComplete="organization" minLength={2} maxLength={120} required placeholder="Your business"/></label>
    <label>Email address *<input name="email" type="email" autoComplete="email" required placeholder="you@business.com"/></label>
    <label>Phone / WhatsApp *<input name="phone" type="tel" autoComplete="tel" minLength={7} maxLength={35} required placeholder="+92 ..."/></label>
    <label>Number of locations *<select name="branchBand" defaultValue="ONE"><option value="ONE">One location</option><option value="TWO_TO_FIVE">2–5 locations</option><option value="SIX_PLUS">6+ locations</option></select></label>
    <label>Preferred contact method <select name="preferredContactMethod" defaultValue="WHATSAPP"><option value="WHATSAPP">WhatsApp</option><option value="PHONE">Phone</option><option value="EMAIL">Email</option></select></label>
    <label>Preferred contact time <input name="preferredContactTime" type="text" maxLength={120} placeholder="Optional"/></label>
    {kind === "QUOTE" || kind === "CONTACT" ? <label>Budget range <input name="budgetRange" type="text" maxLength={120} placeholder="Optional"/></label> : null}
    <div className="form-full"><span className="form-label">What are you interested in?</span><div className="form-services">{serviceKeys.map((key) => <label key={key}><input type="checkbox" checked={selected.includes(key)} onChange={() => setSelected(selected.includes(key) ? selected.filter((value) => value !== key) : [...selected, key])}/>{labels[key]}</label>)}</div></div>
    <label className="form-full">Project details <textarea name="message" maxLength={3000} placeholder="Tell us about your current setup, goals or timeline."/></label>
    <label className="honeypot" aria-hidden="true">Website <input name="website" tabIndex={-1} autoComplete="off"/></label>
    {status === "error" ? <div className="form-error form-full" role="alert">{message}</div> : null}
    <button className="button button-dark form-full" type="submit" disabled={status === "sending"}>{status === "sending" ? <LoaderCircle className="spin" size={18}/> : null}{status === "sending" ? "Sending…" : content.button}<ArrowRight size={17}/></button>
    <span className="form-note form-full">By submitting, you agree to be contacted about your inquiry. Please don&apos;t share passwords or payment card details.</span>
  </form>;
}
