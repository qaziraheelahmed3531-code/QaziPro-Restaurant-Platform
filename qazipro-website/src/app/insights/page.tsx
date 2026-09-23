import Link from "next/link";
import { ArrowUpRight } from "lucide-react";
import { pageMetadata } from "@/lib/metadata";
export const metadata = pageMetadata("Insights", "QaziPro insights and product notes.", "/insights");
export default function Insights() { return <section className="page-hero"><div className="container"><span className="eyebrow">INSIGHTS</span><h1>Ideas worth sharing,<br/>when they are ready.</h1><p>Our writing space is being prepared. We will publish useful product and operations guidance here—no filler or copied content.</p><Link className="text-link" href="/contact">Ask us a question <ArrowUpRight size={18}/></Link></div></section>; }
