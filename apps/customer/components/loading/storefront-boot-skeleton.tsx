"use client"

import { usePathname } from "next/navigation"
import { useEffect, useState } from "react"

import { StorefrontSkeleton } from "@/components/loading/storefront-skeleton"

export function StorefrontBootSkeleton() {
  const pathname = usePathname()
  const [visible, setVisible] = useState(true)

  useEffect(() => {
    const timer = window.setTimeout(() => setVisible(false), 420)
    return () => window.clearTimeout(timer)
  }, [])

  if (pathname !== "/" || !visible) return null
  return <StorefrontSkeleton overlay />
}
