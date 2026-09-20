"use client"

import { useEffect } from "react"

import { pendingHomeSectionKey, scrollToHomeSection, type HomeSectionId } from "@/lib/navigation/home-sections"

export function HomeHashScroller() {
  useEffect(() => {
    const pending = window.sessionStorage.getItem(pendingHomeSectionKey) as HomeSectionId | null
    if (!pending) return
    const reduceMotion = window.matchMedia("(prefers-reduced-motion: reduce)").matches
    const frame = window.requestAnimationFrame(() => {
      window.sessionStorage.removeItem(pendingHomeSectionKey)
      scrollToHomeSection(pending, reduceMotion)
    })
    return () => window.cancelAnimationFrame(frame)
  }, [])

  return null
}
