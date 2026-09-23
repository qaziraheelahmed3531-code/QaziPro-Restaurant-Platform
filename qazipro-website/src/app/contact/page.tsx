import { Suspense } from "react";
import Image from "next/image";
import { Mail, Phone } from "lucide-react";
import { LeadForm } from "@/components/lead-form";
import { site, whatsappLink } from "@/lib/site";
import { pageMetadata } from "@/lib/metadata";
export const metadata = pageMetadata("Contact", "Talk to QaziPro about restaurant systems, Shopify or a custom software project.", "/contact");
export default function Contact() { return <section className="form-page"><div className="container form-layout"><div className="form-intro"><span className="eyebrow">CONTACT QAZIPRO</span><h1>Let&apos;s talk about what comes next.</h1><p>A clear conversation is the best place to start. Share what your business needs, and we&apos;ll help identify a sensible next step.</p><div className="contact-methods"><a href={`mailto:${site.email}`}><Mail size={19}/>{site.email}</a><a href={`tel:${site.phone}`}><Phone size={19}/>+92 307 5008055</a><a href={whatsappLink("a project")} target="_blank" rel="noopener noreferrer"><Image className="contact-whatsapp-icon" src="/brand/whatsapp.png" width={22} height={22} alt=""/>Chat on WhatsApp</a></div></div><Suspense><LeadForm kind="CONTACT"/></Suspense></div></section>; }
