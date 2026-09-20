"use client"

import { Minus, Plus } from "lucide-react"
import { motion } from "motion/react"

import { useHydrationSafeReducedMotion } from "@/lib/motion/use-hydration-safe-reduced-motion"

export function QuantityControl({ value, onChange }: { value: number; onChange: (value: number) => void }) {
  const reduceMotion = useHydrationSafeReducedMotion()
  return (
    <div className="quantity-control" aria-label="Quantity">
      <button type="button" onClick={() => onChange(Math.max(0, value - 1))} aria-label="Decrease quantity"><Minus /></button>
      <motion.output key={value} initial={reduceMotion ? false : { opacity: 0.55, y: 3 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: reduceMotion ? 0 : 0.14 }} aria-live="polite">{value}</motion.output>
      <button type="button" onClick={() => onChange(Math.min(20, value + 1))} aria-label="Increase quantity"><Plus /></button>
    </div>
  )
}
