"use client"

import Image from "next/image"
import { motion } from "motion/react"
import { useEffect, useRef, useState } from "react"

import { useHydrationSafeReducedMotion } from "@/lib/motion/use-hydration-safe-reduced-motion"
import { scrollToHomeSection } from "@/lib/navigation/home-sections"
import type { MenuSection, MenuSectionId } from "@/types"

export function CategoryTiles({ sections }: { sections: MenuSection[] }) {
  const reduceMotion = useHydrationSafeReducedMotion()
  const railRef = useRef<HTMLDivElement>(null)
  const firstSection = sections[0]?.id ?? "deals"
  const [active, setActive] = useState<MenuSectionId>(firstSection)
  const activeRef = useRef<MenuSectionId>(firstSection)

  useEffect(() => {
    const visibleRatios = new Map<MenuSectionId, number>()
    const observer = new IntersectionObserver((entries) => {
      entries.forEach((entry) => {
        const id = entry.target.id as MenuSectionId
        if (entry.isIntersecting) visibleRatios.set(id, entry.intersectionRatio)
        else visibleRatios.delete(id)
      })
      const id = Array.from(visibleRatios.entries()).sort((a, b) => b[1] - a[1] || sections.findIndex((section) => section.id === a[0]) - sections.findIndex((section) => section.id === b[0]))[0]?.[0]
      if (!id || activeRef.current === id) return
      activeRef.current = id
      setActive(id)

      const rail = railRef.current
      const activeButton = railRef.current?.querySelector<HTMLButtonElement>(`[data-category-id="${id}"]`)
      if (rail && activeButton && rail.scrollWidth > rail.clientWidth) {
        const targetLeft = activeButton.offsetLeft - rail.clientWidth / 2 + activeButton.clientWidth / 2
        rail.scrollTo({ left: Math.max(0, Math.min(targetLeft, rail.scrollWidth - rail.clientWidth)), behavior: reduceMotion ? "auto" : "smooth" })
      }
    }, { rootMargin: "-24% 0px -58%", threshold: [0, 0.15, 0.4] })
    sections.forEach((section) => {
      const element = document.getElementById(section.id)
      if (element) observer.observe(element)
    })
    return () => observer.disconnect()
  }, [reduceMotion, sections])

  return (
    <div ref={railRef} className="category-tile-rail" aria-label="Food categories">
      {sections.map((section) => (
        <motion.button
          key={section.id}
          type="button"
          data-category-id={section.id}
          className={active === section.id ? "category-tile is-active" : "category-tile"}
          aria-pressed={active === section.id}
          onClick={() => { activeRef.current = section.id; setActive(section.id); scrollToHomeSection(section.id, Boolean(reduceMotion)) }}
          animate={active === section.id ? { y: -3 } : { y: 0 }}
          transition={reduceMotion ? { duration: 0 } : { type: "spring", stiffness: 360, damping: 28 }}
        >
          <span className="category-tile__image"><Image src={section.categoryImage} fill unoptimized priority sizes="(max-width: 767px) 132px, 160px" alt="" /></span>
          <strong>{section.title}</strong>
          {active === section.id && <motion.span className="category-tile__indicator" layoutId="active-image-category" aria-hidden="true" />}
        </motion.button>
      ))}
    </div>
  )
}
