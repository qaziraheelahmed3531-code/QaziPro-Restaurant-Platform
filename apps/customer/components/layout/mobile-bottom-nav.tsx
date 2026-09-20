"use client"

import Link from "next/link"
import { Home, Menu, ReceiptText, Tag, UserRound } from "lucide-react"
import { usePathname } from "next/navigation"
import { motion } from "motion/react"
import { useEffect, useRef, useState, type MouseEvent } from "react"

import { useHomeSectionNavigation, type HomeSectionId } from "@/lib/navigation/home-sections"
import { useHydrationSafeReducedMotion } from "@/lib/motion/use-hydration-safe-reduced-motion"

const items = [
  { label: "Home", href: "/", section: "home" as HomeSectionId, icon: Home },
  { label: "Menu", href: "/#menu", section: "menu" as HomeSectionId, icon: Menu },
  { label: "Deals", href: "/#deals", section: "deals" as HomeSectionId, icon: Tag },
  { label: "Orders", href: "/orders", icon: ReceiptText },
  { label: "Account", href: "/account", icon: UserRound },
]

export function MobileBottomNav() {
  const pathname = usePathname()
  const navigateHome = useHomeSectionNavigation()
  const reduceMotion = useHydrationSafeReducedMotion()
  const [homeSection, setHomeSection] = useState<HomeSectionId>("home")
  const navigationLockRef = useRef<HomeSectionId | null>(null)

  useEffect(() => {
    if (pathname !== "/") return
    const targets = (["home", "menu", "deals", "pizzas", "burgers", "beverages", "addons", "fries", "bbq", "sides"] as const).map((id) => document.getElementById(id)).filter(Boolean) as HTMLElement[]
    const observer = new IntersectionObserver((entries) => {
      const visible = entries.filter((entry) => entry.isIntersecting).sort((a, b) => b.intersectionRatio - a.intersectionRatio)[0]
      if (!visible) return
      const section = visible.target.id === "home" ? "home" : visible.target.id === "deals" ? "deals" : "menu"
      if (navigationLockRef.current && navigationLockRef.current !== section) return
      navigationLockRef.current = null
      setHomeSection(section)
    }, { rootMargin: "-20% 0px -60%", threshold: [0.05, 0.25] })
    targets.forEach((target) => observer.observe(target))
    return () => observer.disconnect()
  }, [pathname])

  return (
    <nav className="mobile-bottom-nav" aria-label="Mobile navigation">
      {items.map((item) => {
        const Icon = item.icon
        const active = item.label === "Orders" ? pathname.startsWith("/orders") : item.label === "Account" ? pathname.startsWith("/account") : pathname === "/" && homeSection === item.section
        const handleClick = (event: MouseEvent<HTMLAnchorElement>) => {
          if (!item.section) return
          event.preventDefault()
          setHomeSection(item.section)
          navigationLockRef.current = item.section === "home" ? null : item.section
          navigateHome(item.section)
        }
        return (
          <Link key={item.label} href={item.href} onClick={handleClick} className={active ? "is-active" : undefined} aria-current={active ? "page" : undefined}>
            {active && <motion.span className="mobile-nav-indicator" layoutId="mobile-nav-indicator" transition={reduceMotion ? { duration: 0 } : { type: "spring", stiffness: 420, damping: 34 }} />}
            <Icon aria-hidden="true" />
            <span>{item.label}</span>
          </Link>
        )
      })}
    </nav>
  )
}
