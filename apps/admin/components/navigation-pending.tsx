"use client"

import { useLinkStatus } from "next/link"
import { AppLoader } from "@italian-pizza/shared/app-loader"

// Next owns the navigation lifecycle, including cancellation and back/forward.
// A remembered click target is not proof that a route is still loading.
export function NavigationPending({ active, label }: { active: boolean; label: string }) {
  const { pending } = useLinkStatus()
  return pending && !active ? <span data-navigation-pending="true"><AppLoader active label={`Opening ${label}`} /></span> : null
}
