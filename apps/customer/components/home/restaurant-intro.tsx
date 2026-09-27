"use client"

import { ArrowDown, MapPin } from "lucide-react"
import { useApp } from "@/components/providers/app-provider"
import { useHydrationSafeReducedMotion } from "@/lib/motion/use-hydration-safe-reduced-motion"
import { scrollToElement } from "@/lib/navigation/home-sections"

export function RestaurantIntro() {
  const { storefront } = useApp()
  const reducedMotion = useHydrationSafeReducedMotion()
  const name = storefront.branch.restaurantName ?? storefront.business.name
  const tagline = storefront.business.tagline?.trim()
  const description = storefront.business.description?.trim()
  const location = [storefront.branch.name, storefront.branch.city].filter((part, index, parts) => part && parts.findIndex(value => value?.trim().toLowerCase() === part.trim().toLowerCase()) === index).join(" · ")
  return <section className="restaurant-intro" aria-labelledby="restaurant-title">
    <div className="restaurant-intro__copy">
      <p className="restaurant-intro__eyebrow">{tagline && tagline.length <= 60 ? tagline : "Menu & ordering"}</p>
      <h1 id="restaurant-title" aria-label={name}>{name.split(/\s+/).map((word, index) => <span aria-hidden="true" key={`${word}-${index}`} style={{ animationDelay: `${Math.min(index, 5) * 55}ms` }}>{word} </span>)}</h1>
      {(description || (tagline && tagline.length > 60)) && description !== (tagline && tagline.length <= 60 ? tagline : undefined) && <p className="restaurant-intro__description">{description || tagline}</p>}
      <p className="restaurant-intro__location"><MapPin size={16} aria-hidden="true" />{location}<span className={`restaurant-intro__status${storefront.branch.isOpen ? " is-open" : ""}`}>{storefront.branch.isOpen ? "Open now" : "Currently closed"}</span></p>
    </div>
    <a className="button-link restaurant-intro__cta" href="#menu" onClick={event => { const menu = document.getElementById("menu"); if (!menu) return; event.preventDefault(); scrollToElement(menu, Boolean(reducedMotion)); menu.focus({ preventScroll: true }) }}>Explore the menu<ArrowDown size={18} aria-hidden="true" /></a>
  </section>
}
