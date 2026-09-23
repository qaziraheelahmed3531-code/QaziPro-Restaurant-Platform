import Image from "next/image";
import Link from "next/link";
import { ArrowUpRight, Mail, Phone } from "lucide-react";
import { developmentServices, restaurantServices, site, whatsappLink } from "@/lib/site";

export function SiteFooter() {
  return <footer className="site-footer"><div className="container">
    <div className="footer-cta"><div><span className="eyebrow eyebrow-light">LET&apos;S BUILD WHAT&apos;S NEXT</span><h2>Good software should make<br/>business feel easier.</h2></div><Link href="/contact" className="button button-primary">Tell us what you&apos;re building <ArrowUpRight size={19}/></Link></div>
    <div className="footer-grid"><div className="footer-brand"><Link className="brand brand-light brand-mark footer-logo" href="/" aria-label="QaziPro home"><Image src="/brand/qazipro-mark-clean.png" width={720} height={413} sizes="150px" alt="QaziPro" style={{ height: "auto" }}/><strong>QaziPro</strong></Link><p>Connected restaurant systems and custom software, built with care.</p><div className="footer-contact"><a href={`mailto:${site.email}`}><Mail size={17}/>{site.email}</a><a href={`tel:${site.phone}`}><Phone size={17}/>+92 307 5008055</a></div></div>
      <div><h3>Restaurant</h3><Link href="/restaurant-platform">The platform</Link>{restaurantServices.map((item) => <Link href={item.href} key={item.href}>{item.title}</Link>)}</div>
      <div><h3>Development</h3><Link href="/services">All services</Link>{developmentServices.map((item) => <Link href={item.href} key={item.href}>{item.title}</Link>)}<Link href="/portfolio">Selected work</Link></div>
      <div><h3>Company</h3><Link href="/about">About QaziPro</Link><Link href="/contact">Contact</Link><Link href="/book-a-demo">Book a demo</Link><Link href="/get-a-quote">Get a quote</Link><Link href="/insights">Insights</Link><a href={site.clientPortal}>Client login</a><a href={whatsappLink("a project")} target="_blank" rel="noopener noreferrer">WhatsApp support <ArrowUpRight size={14}/></a></div></div>
    <div className="footer-bottom"><span>© {new Date().getFullYear()} QaziPro. Built for work that matters.</span><div><Link href="/privacy">Privacy</Link><Link href="/terms">Terms</Link><span>Pakistan · Working worldwide</span></div></div>
  </div></footer>;
}
