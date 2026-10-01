"use client";

import Image from "next/image";
import Link from "next/link";
import { ArrowRight, ChevronDown, LogIn, Menu, X } from "lucide-react";
import { useEffect, useRef, useState } from "react";
import { motion } from "motion/react";
import { useReducedMotion } from "@/lib/use-reduced-motion";
import { developmentServices, restaurantServices, site } from "@/lib/site";

const groups = [
  { id: "restaurant", label: "Restaurant platform", href: "/restaurant-platform", items: restaurantServices },
  { id: "development", label: "Development", href: "/services", items: developmentServices },
];

export function SiteHeader() {
  const [mobileOpen, setMobileOpen] = useState(false);
  const [active, setActive] = useState<string | null>(null);
  const header = useRef<HTMLElement>(null);
  const toggle = useRef<HTMLButtonElement>(null);
  const closeTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const reduced = useReducedMotion();
  const cancelClose = () => { if (closeTimer.current) clearTimeout(closeTimer.current); };
  const close = () => { cancelClose(); setActive(null); };
  const scheduleClose = () => { cancelClose(); closeTimer.current = setTimeout(() => setActive(null), 130); };

  useEffect(() => () => { if (closeTimer.current) clearTimeout(closeTimer.current); }, []);
  useEffect(() => {
    if (!mobileOpen) return;
    const previous = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    const media = matchMedia("(min-width: 1101px)");
    const resize = () => { if (media.matches) setMobileOpen(false); };
    media.addEventListener("change", resize);
    return () => { document.body.style.overflow = previous; media.removeEventListener("change", resize); };
  }, [mobileOpen]);
  useEffect(() => {
    const outside = (event: PointerEvent) => { if (!header.current?.contains(event.target as Node)) setActive(null); };
    const keyboard = (event: KeyboardEvent) => {
      if (event.key === "Escape") {
        if (mobileOpen) { setMobileOpen(false); toggle.current?.focus(); }
        else if (active) { header.current?.querySelector<HTMLButtonElement>('[data-menu-trigger="' + active + '"]')?.focus(); setActive(null); }
      }
      if (event.key === "Tab" && mobileOpen) {
        const items = Array.from(header.current?.querySelectorAll<HTMLElement>(".mobile-menu-toggle, .mobile-nav a, .mobile-nav summary") ?? []).filter(el => el.getClientRects().length);
        const first = items[0], last = items.at(-1);
        if (event.shiftKey && document.activeElement === first) { event.preventDefault(); last?.focus(); }
        else if (!event.shiftKey && document.activeElement === last) { event.preventDefault(); first?.focus(); }
      }
    };
    document.addEventListener("pointerdown", outside);
    document.addEventListener("keydown", keyboard);
    return () => { document.removeEventListener("pointerdown", outside); document.removeEventListener("keydown", keyboard); };
  }, [mobileOpen, active]);

  return <header ref={header} className="site-header" data-menu-open={Boolean(active) || mobileOpen}>
    <div className="container header-inner">
      <Link className="brand brand-mark" href="/" aria-label="QaziPro home"><Image src="/brand/qazipro-mark-clean.png" width={720} height={413} sizes="104px" alt="QaziPro" loading="eager" style={{ height: "auto" }}/></Link>
      <nav className="desktop-nav" aria-label="Main navigation">
        {groups.map(group => <div className="nav-dropdown" key={group.id}
          onPointerEnter={event => { if (event.pointerType !== "touch") { cancelClose(); setActive(group.id); } }}
          onPointerLeave={scheduleClose}
          onFocus={cancelClose}
          onBlur={event => { if (!event.currentTarget.contains(event.relatedTarget)) close(); }}>
          <button type="button" className="nav-trigger" data-menu-trigger={group.id} aria-expanded={active === group.id} aria-controls={"nav-" + group.id}
            onClick={() => { cancelClose(); setActive(active === group.id ? null : group.id); }}
            onKeyDown={event => { if (event.key === "ArrowDown") { event.preventDefault(); cancelClose(); setActive(group.id); requestAnimationFrame(() => header.current?.querySelector<HTMLAnchorElement>("#nav-" + group.id + " a")?.focus()); } }}>
            {group.label} <ChevronDown size={15}/>
          </button>
          <motion.div id={"nav-" + group.id} className="nav-popover" inert={active !== group.id}
            initial={false} animate={{ opacity: active === group.id ? 1 : 0, y: active === group.id || reduced ? 0 : -6 }}
            transition={{ duration: reduced ? 0 : .2, ease: [.22, .8, .28, 1] }}
            style={{ visibility: active === group.id ? "visible" : "hidden", pointerEvents: active === group.id ? "auto" : "none" }}>
            <div className="nav-popover-intro"><strong>{group.id === "restaurant" ? "One connected restaurant system" : "Software built for your business"}</strong><span>{group.id === "restaurant" ? "From the counter to the customer's phone." : "Commerce, custom applications and dependable integrations."}</span><Link href={group.href} onClick={close}>Explore {group.id === "restaurant" ? "platform" : "services"} <ArrowRight size={15}/></Link></div>
            <div className="nav-popover-links">{group.items.map(item => <Link href={item.href} key={item.href} onClick={close}><strong>{item.title}</strong><span>{item.description}</span></Link>)}</div>
          </motion.div>
        </div>)}
        <Link href="/portfolio">Our work</Link><Link href="/about">About</Link><Link href="/contact">Contact</Link>
      </nav>
      <div className="header-actions"><Link className="client-link" href="/book-a-demo">Book a demo</Link><Link className="client-portal-button" href={site.clientPortal}>Client portal <LogIn size={16}/></Link><Link className="button button-primary button-sm" href="/client-onboarding">Get started <ArrowRight size={16}/></Link></div>
      <button ref={toggle} className="mobile-menu-toggle" type="button" aria-label={mobileOpen ? "Close menu" : "Open menu"} aria-expanded={mobileOpen} aria-controls="mobile-navigation" onClick={() => { close(); setMobileOpen(!mobileOpen); }}>{mobileOpen ? <X size={24}/> : <Menu size={24}/>}</button>
    </div>
    <nav className={`mobile-nav ${mobileOpen ? "mobile-nav-open" : ""}`} id="mobile-navigation" aria-label="Mobile navigation" inert={!mobileOpen} onClick={event => { if ((event.target as HTMLElement).closest("a")) setMobileOpen(false); }}>
      <div className="mobile-nav-inner">{groups.map(group => <details key={group.id}><summary>{group.label}<ChevronDown size={18}/></summary><Link href={group.href}>Overview <ArrowRight size={16}/></Link>{group.items.map(item => <Link className="mobile-sub-link" href={item.href} key={item.href}>{item.title}</Link>)}</details>)}<Link href="/portfolio">Our work</Link><Link href="/about">About</Link><Link href="/contact">Contact</Link><Link className="client-portal-button mobile-client-portal" href={site.clientPortal}>Client portal <LogIn size={17}/></Link><Link className="button button-primary" href="/client-onboarding">Get started <ArrowRight size={17}/></Link><Link href="/book-a-demo">Book a demo</Link></div>
    </nav>
  </header>;
}
