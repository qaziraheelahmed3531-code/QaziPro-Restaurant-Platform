"use client"

import { MOTION_EASE } from "@italian-pizza/shared/motion"
import { motion } from "motion/react"
import type { ReactNode } from "react"
import { useHydrationSafeReducedMotion } from "@/lib/motion/use-hydration-safe-reduced-motion"

export function Reveal({children,className=""}:{children:ReactNode;className?:string}) {
  const reduceMotion=useHydrationSafeReducedMotion()
  return <motion.div className={className} initial={reduceMotion?false:{opacity:0,y:10}} whileInView={{opacity:1,y:0}} viewport={{once:true,amount:.15}} transition={{duration:reduceMotion?0:.3,ease:MOTION_EASE}}>{children}</motion.div>
}
