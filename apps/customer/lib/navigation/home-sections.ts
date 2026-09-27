"use client"

import { useCallback } from "react"
import { usePathname, useRouter } from "next/navigation"

import { useHydrationSafeReducedMotion } from "@/lib/motion/use-hydration-safe-reduced-motion"
import { scrollWindowTo } from "@/lib/motion/scroll-runtime"

export type HomeSectionId = string

export const pendingHomeSectionKey = "italian-pizza-pending-home-section"

export function scrollToElement(target: HTMLElement, reduceMotion = false, align: "start" | "center" = "start") {
  const mainHeaderHeight = document.querySelector<HTMLElement>(".site-header")?.getBoundingClientRect().height ?? 0
  // Reserve the compact row for every programmatic menu/search target. This
  // keeps floating Search results below the complete sticky chrome.
  const categoryNav = document.querySelector<HTMLElement>(".sticky-category-nav")
  const categoryHeight = categoryNav && (categoryNav.classList.contains("is-visible") || target.id === "search" || target.classList.contains("category-menu-section"))
    ? categoryNav.getBoundingClientRect().height || 52
    : 0
  const headerHeight = mainHeaderHeight + categoryHeight
  const targetTop = target.getBoundingClientRect().top + window.scrollY
  const centeredOffset = Math.max(headerHeight + 12, (window.innerHeight - target.offsetHeight) / 2)
  const top = align === "center" ? targetTop - centeredOffset : targetTop - headerHeight - 12
  scrollWindowTo(Math.max(0, top), reduceMotion)
}

export function scrollToHomeSection(id: HomeSectionId, reduceMotion = false) {
  const target = document.getElementById(id)
  if (!target) return false
  if (id === "home") scrollWindowTo(0, reduceMotion)
  else scrollToElement(target, reduceMotion)
  const url = new URL(window.location.href)
  url.hash = id === "home" ? "" : id
  window.history.replaceState(null, "", `${url.pathname}${url.search}${url.hash}`)
  return true
}

export function useHomeSectionNavigation() {
  const pathname = usePathname()
  const router = useRouter()
  const reduceMotion = useHydrationSafeReducedMotion()

  return useCallback((id: HomeSectionId) => {
    if (pathname === "/") {
      scrollToHomeSection(id, Boolean(reduceMotion))
      return
    }
    if (id === "home") router.push("/")
    else {
      window.sessionStorage.setItem(pendingHomeSectionKey, id)
      router.push("/", { scroll: false })
    }
  }, [pathname, reduceMotion, router])
}
