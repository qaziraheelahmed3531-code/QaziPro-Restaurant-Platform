import { Suspense } from "react";
import { CircleCheck } from "lucide-react";
import { LeadForm } from "@/components/lead-form";
import { pageMetadata } from "@/lib/metadata";
export const metadata = pageMetadata("Book a Demo", "Request a guided conversation about the QaziPro restaurant platform.", "/book-a-demo");
export default function Demo() { return <section className="form-page"><div className="container form-layout"><div className="form-intro"><span className="eyebrow">SEE QAZIPRO IN CONTEXT</span><h1>A demo that starts with your restaurant.</h1><p>Tell us how your operation works today. We&apos;ll focus the conversation on the systems most relevant to your team.</p><ul className="check-list"><li><CircleCheck size={18}/> POS and order management</li><li><CircleCheck size={18}/> Online ordering and mobile apps</li><li><CircleCheck size={18}/> Branches, kitchen and reporting</li></ul></div><Suspense><LeadForm kind="DEMO"/></Suspense></div></section>; }
