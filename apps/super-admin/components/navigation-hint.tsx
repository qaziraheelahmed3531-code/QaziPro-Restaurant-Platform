"use client"

import { useLinkStatus } from "next/link"

export function NavigationHint() {
  const { pending } = useLinkStatus()
  return <span className="navigation-hint" data-pending={pending} role="status" aria-label={pending ? "Opening section…" : undefined}/>
}
