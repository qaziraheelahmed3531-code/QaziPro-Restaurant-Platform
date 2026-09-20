"use client"

import Link from "next/link"
import { ChevronDown, Clock3, Mail, MapPin, Phone } from "lucide-react"
import type { MouseEvent } from "react"
import { visibleSocialLinks } from "@italian-pizza/shared/social"
import { useApp } from "@/components/providers/app-provider"
import { BrandLogo } from "@/components/brand/brand-logo"
import { SocialIcon } from "@/components/layout/social-icon"
import { useHomeSectionNavigation } from "@/lib/navigation/home-sections"

const groups = [{ title: "Quick Links", key: "QUICK_LINKS" }, { title: "Support", key: "SUPPORT" }, { title: "Order", key: "ORDER" }]
export function SiteFooter() {
  const navigateHome = useHomeSectionNavigation()
  const { storefront, openLocation, setOrderType } = useApp()
  const { business, branch } = storefront
  const socials = visibleSocialLinks(business.socialLinks)
  const onNavigate = (event: MouseEvent<HTMLAnchorElement>, href: string, label: string) => {
    if (event.metaKey || event.ctrlKey || event.shiftKey || event.altKey) return
    if (href === "/#location") {
      event.preventDefault()
      if (/pickup/i.test(label)) setOrderType("pickup")
      if (/delivery/i.test(label)) setOrderType("delivery")
      openLocation()
    } else if (href.startsWith("/#")) { event.preventDefault(); navigateHome(href.slice(2)) }
  }
  const renderLinks = (key: string) => business.footerLinks.filter(link => link.group === key).map(link =>
    link.isExternal || /^https?:/.test(link.href)
      ? <a key={link.href+link.label} href={link.href} target="_blank" rel="noopener noreferrer">{link.label}</a>
      : <Link key={link.href+link.label} href={link.href} onClick={event => onNavigate(event,link.href,link.label)}>{link.label}</Link>
  )
  return <footer className="site-footer" id="support">
    <div className="site-footer__content">
      <div className="site-footer__brand">
        <BrandLogo logoUrl={business.footerLogoUrl ?? business.logoUrl ?? undefined} brandName={business.displayName} size="lg" placement="footer" showName={!business.footerLogoUrl && !business.logoUrl}/>
        <p className="site-footer__tagline">{business.tagline || business.footerDescription || business.description}</p>
        <address className="site-footer__contact">
          {business.phone && <a href={"tel:"+business.phone.replace(/[^+\d]/g,"")}><Phone aria-hidden="true"/><span>{business.phone}</span></a>}
          {business.email && <a href={"mailto:"+business.email}><Mail aria-hidden="true"/><span>{business.email}</span></a>}
          {business.address && <span><MapPin aria-hidden="true"/><span>{business.address}</span></span>}
        </address>
        {business.contactText && <p className="site-footer__contact-note">{business.contactText}</p>}
        {socials.length>0 && <nav className="site-footer__social" aria-label="Social media">{socials.map(link=><a className={"social-"+link.platform.toLowerCase()} key={link.platform+link.url} href={link.url} target="_blank" rel="noopener noreferrer" aria-label={link.platform}><SocialIcon platform={link.platform}/><span>{link.platform}</span></a>)}</nav>}
        <p className="site-footer__hours"><Clock3 aria-hidden="true"/><strong>Today</strong><span>{branch.todayHoursLabel}</span></p>
        {(business.appStoreUrl||business.playStoreUrl)&&<nav className="footer-app-links" aria-label="Download our app">{business.appStoreUrl&&<a href={business.appStoreUrl} target="_blank" rel="noopener noreferrer">Download on the App Store</a>}{business.playStoreUrl&&<a href={business.playStoreUrl} target="_blank" rel="noopener noreferrer">Get it on Google Play</a>}</nav>}
      </div>
      {groups.map(group => business.footerLinks.some(link=>link.group===group.key) && <div className="footer-navigation" key={group.key}>
        <nav className="footer-group footer-group--desktop" aria-label={group.title}><h3>{group.title}</h3>{renderLinks(group.key)}</nav>
        <details className="footer-group--mobile"><summary>{group.title}<ChevronDown aria-hidden="true"/></summary><nav aria-label={group.title}>{renderLinks(group.key)}</nav></details>
      </div>)}
    </div>
    <nav className="site-footer__policies" aria-label="Policies">{business.contentPages.filter(page=>["privacy","terms"].includes(page.slug)).map(page=><Link href={"/pages/"+page.slug} key={page.slug}>{page.title}</Link>)}</nav>
    <div className="site-footer__legal"><a href="https://wa.me/923079963990" target="_blank" rel="noopener noreferrer">Powered by QAZIRAHEELAHMAD</a></div>
  </footer>
}
