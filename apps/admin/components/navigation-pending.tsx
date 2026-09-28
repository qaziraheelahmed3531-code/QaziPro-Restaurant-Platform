"use client"

import { useLinkStatus } from "next/link"
import { AppLoader } from "@italian-pizza/shared/app-loader"

// Next owns the navigation lifecycle, including cancellation and back/forward.
// A remembered click target is not proof that a route is still loading.
export function NavigationPending({ active, label }: { active: boolean; label: string }) {
  const { pending } = useLinkStatus()
  const loading = pending && !active
  // Reserve the indicator's space and acknowledge real navigation immediately.
  // The route skeleton takes over when Next starts streaming the destination.
  return <span data-navigation-pending={loading ? "true" : "false"}>
    {loading && <AppLoader active delay={0} label={`Opening ${label}`} />}
  </span>
}
