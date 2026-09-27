"use client"

import { ShoppingBag, ArrowUpRight } from "lucide-react"
import { AnimatePresence, motion } from "motion/react"
import { MOTION_DURATION, MOTION_EASE } from "@italian-pizza/shared/motion"
import { useApp } from "@/components/providers/app-provider"
import { formatRupees } from "@/lib/format"
import { useHydrationSafeReducedMotion } from "@/lib/motion/use-hydration-safe-reduced-motion"

export function MobileCartBar() {
  const app = useApp()
  const reducedMotion = useHydrationSafeReducedMotion()
  const visible = app.hydrated && app.cartCount > 0 && !app.cartDrawerOpen && !app.locationOpen && !app.productId
  return <AnimatePresence>{visible && <motion.div className="mobile-cart-bar" initial={reducedMotion ? false : { opacity: 0, y: 12 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: reducedMotion ? 0 : 12 }} transition={{ duration: reducedMotion ? 0 : MOTION_DURATION.normal, ease: MOTION_EASE }}>
    <button type="button" className="button-link" onClick={app.openCart} aria-label={`View cart, ${app.cartCount} items, subtotal ${formatRupees(app.subtotal)}`}>
      <ShoppingBag size={20} aria-hidden="true" /><span className="mobile-cart-bar__count" key={app.cartCount}>{app.cartCount}</span><span>View cart<small>Subtotal {formatRupees(app.subtotal)}</small></span><ArrowUpRight size={20} aria-hidden="true" />
    </button>
  </motion.div>}</AnimatePresence>
}
