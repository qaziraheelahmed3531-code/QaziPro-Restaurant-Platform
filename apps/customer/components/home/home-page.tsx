"use client"

import { Bike, Leaf, ShieldCheck, Store } from "lucide-react"

import { StickyCategoryNav } from "@/components/home/sticky-category-nav"
import { CategoryMenuSection } from "@/components/home/category-menu-section"
import { CategoryTiles } from "@/components/home/home-controls"
import { HomeHashScroller } from "@/components/home/home-hash-scroller"
import { HeroCarousel } from "@/components/home/hero-carousel"
import { RestaurantIntro } from "@/components/home/restaurant-intro"
import { MobileCartBar } from "@/components/cart/mobile-cart-bar"
import { MenuSearch } from "@/components/home/menu-search"
import { MobileBottomNav } from "@/components/layout/mobile-bottom-nav"
import { SiteHeader } from "@/components/layout/site-header"
import { useApp } from "@/components/providers/app-provider"
import { Reveal } from "@/components/ui/reveal"

export function HomePage() {
  const { storefront } = useApp()
  const deliveryMessage = `Free delivery up to ${storefront.branch.freeDistanceKm} km · Additional distance may carry a delivery fee`

  return (
    <div className="app-shell home-page">
      <HomeHashScroller />
      <span className="home-anchor" id="home" aria-hidden="true" />
      {(storefront.orderPersistence === "unavailable" || !storefront.branch.isOpen || storefront.business.announcementEnabled) && <div className="announcement">{storefront.orderPersistence === "unavailable" ? "Live ordering is temporarily unavailable · Please retry shortly" : !storefront.branch.isOpen ? "Restaurant is currently closed · Ordering will resume during business hours" : storefront.business.announcementText || deliveryMessage}</div>}
      <SiteHeader />
      <StickyCategoryNav sections={storefront.menuSections} />
      <main>
        <HeroCarousel slides={storefront.heroSlides} settings={storefront.heroSettings} businessName={storefront.business.name} />
        <RestaurantIntro />

        <section className="craving-section" id="menu" tabIndex={-1} aria-labelledby="craving-title">
          <div className="section-heading"><div><h2 id="craving-title">What are you craving?</h2></div></div>
          <CategoryTiles sections={storefront.menuSections} />
          <MenuSearch products={storefront.products} deals={storefront.deals} />
        </section>

        <div className="menu-sections">
          {storefront.menuSections.map((section) => <CategoryMenuSection key={section.id} section={section} products={storefront.products} deals={storefront.deals} />)}
        </div>

        <Reveal className="trust-reveal"><section className="trust-section" aria-labelledby="trust-title">
          <h2 id="trust-title">Order with confidence</h2>
          <div className="trust-grid">
            <div><span><Bike aria-hidden="true" /></span><p><strong>Fast delivery</strong><small>Clear area-based ordering</small></p></div>
            <div><span><Leaf aria-hidden="true" /></span><p><strong>Fresh ingredients</strong><small>Prepared for every order</small></p></div>
            <div id="branches"><span><Store aria-hidden="true" /></span><p><strong>Easy pickup</strong><small>{storefront.branch.restaurantName??storefront.business.name} · {storefront.branch.city}</small></p></div>
            <div><span><ShieldCheck aria-hidden="true" /></span><p><strong>Clear checkout</strong><small>Review every detail before placing</small></p></div>
          </div>
        </section></Reveal>
      </main>
      <MobileBottomNav />
      <MobileCartBar />
    </div>
  )
}
