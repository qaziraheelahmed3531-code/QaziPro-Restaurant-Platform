"use client"

import { useRouter } from "next/navigation"
import { useEffect, useRef } from "react"

import { useApp } from "@/components/providers/app-provider"

export function CartPage() {
  const router = useRouter()
  const { openCart } = useApp()
  const didOpen = useRef(false)

  useEffect(() => {
    if (didOpen.current) return
    didOpen.current = true
    openCart()
    router.replace("/")
  }, [openCart, router])

  return <main className="cart-route-transition" aria-live="polite">Opening your cart…</main>
}
