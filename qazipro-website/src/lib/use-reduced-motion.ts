"use client";

import { useSyncExternalStore } from "react";

const query = "(prefers-reduced-motion: reduce)";
function subscribe(change: () => void) {
  const preference = window.matchMedia(query);
  preference.addEventListener("change", change);
  return () => preference.removeEventListener("change", change);
}
// The hydration snapshot must match the server; the preference is applied
// immediately after hydration, including subsequent OS preference changes.
export function useReducedMotion() {
  return useSyncExternalStore(subscribe, () => window.matchMedia(query).matches, () => false);
}
