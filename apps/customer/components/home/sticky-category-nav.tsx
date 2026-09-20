"use client"

import { useEffect, useRef, useState } from "react"
import { scrollToHomeSection } from "@/lib/navigation/home-sections"
import { useHydrationSafeReducedMotion } from "@/lib/motion/use-hydration-safe-reduced-motion"
import type { MenuSection } from "@/types"

/** Observers only change presentation. Only an explicit click can navigate vertically. */
export function StickyCategoryNav({ sections }: { sections: MenuSection[] }) {
  const [visible, setVisible] = useState(false)
  const [active, setActive] = useState(sections[0]?.id ?? "")
  const [headerHeight, setHeaderHeight] = useState(0)
  const [lowerSection, setLowerSection] = useState(false)
  const rail = useRef<HTMLDivElement>(null)
  const reduced = useHydrationSafeReducedMotion()
  useEffect(() => {
    const header = document.querySelector<HTMLElement>(".site-header")
    const cards = document.querySelector<HTMLElement>(".category-tile-rail")
    if (!header || !cards) return
    let cardsObserver: IntersectionObserver | undefined
    let sectionsObserver: IntersectionObserver | undefined
    let lowerObserver: IntersectionObserver | undefined
    const observe = () => {
      const height = header.getBoundingClientRect().height
      setHeaderHeight(height)
      cardsObserver?.disconnect(); sectionsObserver?.disconnect(); lowerObserver?.disconnect()
      cardsObserver = new IntersectionObserver(([entry]) => {
        setVisible(!entry.isIntersecting && entry.boundingClientRect.bottom <= height)
      }, { rootMargin: `-${height}px 0px 0px`, threshold: 0 })
      cardsObserver.observe(cards)
      const positions = new Map<string, number>()
      sectionsObserver = new IntersectionObserver(entries => {
        for (const entry of entries) {
          if (entry.isIntersecting) positions.set(entry.target.id, entry.boundingClientRect.top)
          else positions.delete(entry.target.id)
        }
        const first = [...positions].sort((a, b) => a[1] - b[1])[0]?.[0]
        if (first) setActive(first)
      }, { rootMargin: `-${height + 52}px 0px -55% 0px`, threshold: 0 })
      sections.forEach(section => { const node = document.getElementById(section.id); if (node) sectionsObserver!.observe(node) })
      const lowerVisibility = new Map<Element, boolean>()
      const lowerSections = [
        document.getElementById("google-reviews"),
        document.querySelector<HTMLElement>(".site-footer"),
      ].filter((section): section is HTMLElement => Boolean(section))
      lowerObserver = lowerSections.length ? new IntersectionObserver(entries => {
        for (const entry of entries) lowerVisibility.set(entry.target, entry.isIntersecting)
        setLowerSection([...lowerVisibility.values()].some(Boolean))
      }, { threshold: 0.01 }) : undefined
      for (const section of lowerSections) {
        lowerVisibility.set(section, false)
        lowerObserver?.observe(section)
      }
    }
    observe()
    const resize = new ResizeObserver(observe)
    resize.observe(header)
    return () => { resize.disconnect(); cardsObserver?.disconnect(); sectionsObserver?.disconnect(); lowerObserver?.disconnect() }
  }, [sections])
  useEffect(() => {
    const container = rail.current
    const button = container?.querySelector<HTMLButtonElement>("[aria-current=true]")
    if (!visible || !container || !button) return
    const left = button.offsetLeft - container.clientWidth / 2 + button.clientWidth / 2
    container.scrollTo({ left: Math.max(0, left), behavior: reduced ? "auto" : "smooth" })
  }, [active, visible, reduced])
  const isVisible = visible && !lowerSection
  return <nav className={`sticky-category-nav${isVisible ? " is-visible" : ""}`} style={{ top: headerHeight }} aria-label="Quick menu categories" aria-hidden={!isVisible} inert={!isVisible}>
    <div ref={rail} className="sticky-category-rail">{sections.map(section => <button type="button" key={section.id} aria-current={active === section.id ? "true" : undefined} onClick={() => { setActive(section.id); scrollToHomeSection(section.id, Boolean(reduced)) }}>{section.title}</button>)}</div>
  </nav>
}
