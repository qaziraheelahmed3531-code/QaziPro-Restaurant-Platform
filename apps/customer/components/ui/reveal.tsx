"use client"

import { MOTION_EASE } from "@italian-pizza/shared/motion"
import { motion } from "motion/react"
import type { ReactNode } from "react"

export function Reveal({children,className=""}:{children:ReactNode;className?:string}) {
  return <motion.div className={className} initial={{opacity:0,y:10}} whileInView={{opacity:1,y:0}} viewport={{once:true,amount:.15}} transition={{duration:.38,ease:MOTION_EASE}}>{children}</motion.div>
}
