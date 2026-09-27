"use client"

import { useSyncExternalStore } from "react"

const query = "(max-width: 767px)"
const subscribe = (notify: () => void) => {
  const media = window.matchMedia(query)
  media.addEventListener("change", notify)
  return () => media.removeEventListener("change", notify)
}
const snapshot = () => window.matchMedia(query).matches
const serverSnapshot = () => false

export function useMobileViewport() {
  return useSyncExternalStore(subscribe, snapshot, serverSnapshot)
}
