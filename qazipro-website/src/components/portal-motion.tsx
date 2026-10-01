"use client"

import type { ReactNode } from "react"
import { motion, useReducedMotion } from "motion/react"

export function PortalMotion({ children, className = "", delay = 0 }: { children: ReactNode; className?: string; delay?: number }) {
  const reduceMotion = useReducedMotion()
  return <motion.div className={className} initial={{ opacity: 0, y: reduceMotion ? 0 : 14 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: reduceMotion ? 0 : .24, delay: reduceMotion ? 0 : delay, ease: [.22,.8,.28,1] }}>{children}</motion.div>
}
