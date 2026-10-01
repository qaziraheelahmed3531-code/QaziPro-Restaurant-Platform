"use client";

import Image from "next/image";
import Link from "next/link";
import { ArrowRight, ChevronDown, LogIn, Menu, X } from "lucide-react";
import { useEffect, useState } from "react";
import { developmentServices, restaurantServices, site } from "@/lib/site";

export function SiteHeader() {
  const [open, setOpen] = useState(false);
  useEffect(() => {
    document.body.style.overflow = open ? "hidden" : "";
    return () => { document.body.style.overflow = ""; };
  }, [open]);

  return <header className="site-header">
    <div className="container header-inner">
      <Link className="brand brand-mark" href="/" aria-label="QaziPro home"><Image src="/brand/qazipro-mark-clean.png" width={720} height={413} sizes="104px" alt="QaziPro" loading="eager" style={{ height: "auto" }}/></Link>
      <nav className="desktop-nav" aria-label="Main navigation">
        <div className="nav-dropdown"><Link href="/restaurant-platform">Restaurant platform <ChevronDown size={15}/></Link><div className="nav-popover"><div className="nav-popover-intro"><strong>One connected restaurant system</strong><span>From the counter to the customer&apos;s phone.</span><Link href="/restaurant-platform">Explore platform <ArrowRight size={15}/></Link></div><div className="nav-popover-links">{restaurantServices.map((item) => <Link href={item.href} key={item.href}><strong>{item.title}</strong><span>{item.description}</span></Link>)}</div></div></div>
        <div className="nav-dropdown"><Link href="/services">Development <ChevronDown size={15}/></Link><div className="nav-popover nav-popover-small"><div className="nav-popover-links">{developmentServices.map((item) => <Link href={item.href} key={item.href}><strong>{item.title}</strong><span>{item.description}</span></Link>)}</div></div></div>
        <Link href="/portfolio">Our work</Link><Link href="/about">About</Link><Link href="/contact">Contact</Link>
      </nav>
      <div className="header-actions">{site.demoPortal ? <a className="client-link" href={site.demoPortal}>View demo</a> : null}<a className="client-portal-button" href={site.clientPortal}>Client portal <LogIn size={16}/></a><Link className="button button-primary button-sm" href="/book-a-demo">Book a demo <ArrowRight size={16}/></Link></div>
      <button className="mobile-menu-toggle" type="button" aria-label={open ? "Close menu" : "Open menu"} aria-expanded={open} aria-controls="mobile-navigation" onClick={() => setOpen(!open)}>{open ? <X size={24}/> : <Menu size={24}/>}</button>
    </div>
    <nav className={`mobile-nav ${open ? "mobile-nav-open" : ""}`} id="mobile-navigation" aria-label="Mobile navigation" inert={!open} onClick={(event) => { if ((event.target as HTMLElement).closest("a")) setOpen(false); }}>
      <div className="mobile-nav-inner"><Link href="/restaurant-platform">Restaurant platform</Link>{restaurantServices.map((item) => <Link className="mobile-sub-link" href={item.href} key={item.href}>{item.title}</Link>)}<Link href="/services">Development services</Link>{developmentServices.map((item) => <Link className="mobile-sub-link" href={item.href} key={item.href}>{item.title}</Link>)}<Link href="/portfolio">Our work</Link><Link href="/about">About</Link><Link href="/contact">Contact</Link>{site.demoPortal ? <a href={site.demoPortal}>View demo</a> : null}<a className="client-portal-button mobile-client-portal" href={site.clientPortal}>Client portal <LogIn size={17}/></a><Link className="button button-primary" href="/book-a-demo">Book a demo <ArrowRight size={17}/></Link></div>
    </nav>
  </header>;
}
