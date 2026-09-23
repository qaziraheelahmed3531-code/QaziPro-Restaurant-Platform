import { Suspense } from "react";
import { LeadForm } from "@/components/lead-form";
import { pageMetadata } from "@/lib/metadata";
export const metadata = pageMetadata("Get a Quote", "Share your QaziPro restaurant, Shopify or custom software project requirements.", "/get-a-quote");
export default function Quote() { return <section className="form-page"><div className="container form-layout"><div className="form-intro"><span className="eyebrow">START A PROJECT</span><h1>Tell us what you are building.</h1><p>Every project has its own scope. Describe the outcome you need and the systems involved. We&apos;ll discuss an appropriate proposal instead of guessing a price from a form.</p></div><Suspense><LeadForm kind="QUOTE"/></Suspense></div></section>; }
