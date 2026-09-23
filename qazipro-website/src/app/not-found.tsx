import Link from "next/link";
import { ArrowLeft } from "lucide-react";
export default function NotFound() { return <section className="page-hero"><div className="container"><span className="eyebrow">PAGE NOT FOUND</span><h1>This page has moved<br/>or does not exist.</h1><p>Let&apos;s get you back to the QaziPro homepage.</p><Link href="/" className="button button-dark"><ArrowLeft size={18}/> Back to home</Link></div></section>; }
