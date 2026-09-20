"use client"

import { useSyncExternalStore } from "react"

const reducedMotionQuery = "(prefers-reduced-motion: reduce)"

function subscribe(callback: () => void) {
  const mediaQuery = window.matchMedia(reducedMotionQuery)
  mediaQuery.addEventListener("change", callback)
  return () => mediaQuery.removeEventListener("change", callback)
}

export function useHydrationSafeReducedMotion() {
  return useSyncExternalStore(
    subscribe,
    () => window.matchMedia(reducedMotionQuery).matches,
    () => false,
  )
}
