"use client"

import { useEffect } from "react"
import { usePathname } from "next/navigation"
import { useApp } from "./app-provider"
import { registerScrollDriver } from "@/lib/motion/scroll-runtime"

/** Motion owns components; GSAP coordinates this single scroll layer. */
export function StorefrontMotion() {
  const pathname = usePathname()
  const { cartDrawerOpen, locationOpen, productId } = useApp()
  const overlayOpen = cartDrawerOpen || locationOpen || Boolean(productId)
  useEffect(() => {
    if (pathname !== "/" || overlayOpen) return
    const media = window.matchMedia("(min-width: 1024px) and (pointer: fine) and (prefers-reduced-motion: no-preference)")
    let dispose: (() => void) | undefined
    let generation = 0
    const configure = async () => {
      const current = ++generation
      dispose?.(); dispose = undefined
      if (!media.matches) return
      const [{ default: Lenis }, { gsap }, { ScrollTrigger }] = await Promise.all([import("lenis"), import("gsap"), import("gsap/ScrollTrigger")])
      if (current !== generation) return
      gsap.registerPlugin(ScrollTrigger)
      const lenis = new Lenis({ autoRaf: false, lerp: .18, syncTouch: false, anchors: false,
        prevent: node => Boolean(node.closest('dialog,[role="dialog"],textarea,select,[data-lenis-prevent]')) })
      const update = () => lenis.raf(performance.now())
      lenis.on("scroll", ScrollTrigger.update)
      gsap.ticker.add(update)
      const unregister = registerScrollDriver(top => lenis.scrollTo(top, { duration: .38 }))
      // ResizeObserver includes async catalog/image changes, not a per-frame
      // layout read. GSAP coalesces the safe refresh until scrolling settles.
      const resize = new ResizeObserver(() => ScrollTrigger.refresh(true))
      const main = document.querySelector("main")
      if (main) resize.observe(main)
      dispose = () => { resize.disconnect(); unregister(); gsap.ticker.remove(update); lenis.off("scroll", ScrollTrigger.update); lenis.destroy() }
    }
    const change = () => { void configure().catch(() => { dispose?.(); dispose = undefined }) }
    change(); media.addEventListener("change", change)
    return () => { generation++; media.removeEventListener("change", change); dispose?.() }
  }, [pathname, overlayOpen])
  return null
}
