"use client"

import { useEffect, useMemo, useRef, useState, useSyncExternalStore, type ReactNode } from "react"
import { PlatformLogo } from "./platform-branding"
import { CommandPalette } from "./command-palette"
import { SubmitButton } from "./submit-button"
import { AttentionMenu } from "./attention-menu"
import Link from "next/link"
import { usePathname } from "next/navigation"
import {
  Activity, AppWindow, Blocks, Building2, ChevronLeft, ChevronRight,
  CircleDollarSign, ClipboardCheck, CloudCog, FileClock, Inbox,
  Globe2, Headphones, LayoutDashboard, Menu, Network, PackageCheck, Plus,
  Search, Settings, ShieldCheck, Store, Users, X, ListTodo,
} from "lucide-react"
import { modules, type PlatformModule } from "@/lib/platform"
import type { PlatformContext } from "@/lib/auth"
import { signOutAction } from "@/app/actions"

const icons: Record<PlatformModule, typeof Store> = {
  overview: LayoutDashboard, restaurants: Building2, onboarding: ClipboardCheck,
  leads: Inbox,
  branches: Network, apps: AppWindow, domains: Globe2, deployments: CloudCog,
  health: Activity, support: Headphones, billing: CircleDollarSign,
  tasks: ListTodo,
  packages: PackageCheck, team: Users, integrations: Blocks, audit: FileClock,
  settings: Settings,
}

const hrefFor = (key: PlatformModule) => key === "overview" ? "/" : `/${key}`
const subscribe = () => () => {}

export function PlatformShell({ context, children }: { context: PlatformContext; children: ReactNode }) {
  const pathname = usePathname()
  const interactive = useSyncExternalStore(subscribe, () => true, () => false)
  const sidebar = useRef<HTMLElement>(null)
  const body = useRef<HTMLDivElement>(null)
  const [collapsed, setCollapsed] = useState(false)
  const [mobileOpen, setMobileOpen] = useState(false)
  const [paletteOpen, setPaletteOpen] = useState(false)
  const allowed = useMemo(() => (Object.entries(modules) as Array<[PlatformModule, (typeof modules)[PlatformModule]]>)
    .filter(([, item]) => context.permissions.includes(item.permission)), [context.permissions])

  useEffect(() => {
    const onKey = (event: KeyboardEvent) => {
      if ((event.ctrlKey || event.metaKey) && event.key.toLowerCase() === "k") {
        event.preventDefault(); setPaletteOpen((value) => !value)
      }
      if (event.key === "Escape") setPaletteOpen(false)
    }
    window.addEventListener("keydown", onKey)
    return () => window.removeEventListener("keydown", onKey)
  }, [])

  useEffect(() => {
    if (!mobileOpen) return
    const trigger = document.activeElement as HTMLElement
    const menu = sidebar.current
    const pageBody = body.current
    if (!menu || !pageBody) return
    pageBody.inert = true
    const overflow = document.body.style.overflow
    document.body.style.overflow = "hidden"
    const controls = () => Array.from(menu.querySelectorAll<HTMLElement>('a,button')).filter(item => item.getClientRects().length && !item.hasAttribute('disabled'))
    controls()[0]?.focus()
    const trap = (event: KeyboardEvent) => {
      if (event.key === "Escape") setMobileOpen(false)
      if (event.key !== "Tab") return
      const items = controls(), first = items[0], last = items.at(-1)
      if (event.shiftKey && document.activeElement === first) { event.preventDefault(); last?.focus() }
      if (!event.shiftKey && document.activeElement === last) { event.preventDefault(); first?.focus() }
    }
    menu.addEventListener("keydown", trap)
    return () => { pageBody.inert = false; document.body.style.overflow = overflow; menu.removeEventListener("keydown", trap); trigger?.focus() }
  }, [mobileOpen])

  return <div className={`platform-shell ${collapsed ? "is-collapsed" : ""}`}>
    <a className="skip-link" href="#main-content">Skip to content</a>
    <aside ref={sidebar} role={mobileOpen ? "dialog" : undefined} aria-modal={mobileOpen || undefined} aria-label="Navigation" className={`platform-sidebar ${mobileOpen ? "is-open" : ""}`}>
      <div className="platform-brand"><PlatformLogo compact={collapsed}/><span><strong>QaziPro</strong><small>CONTROL CENTER</small></span><button className="icon-button mobile-only" onClick={() => setMobileOpen(false)} aria-label="Close menu"><X/></button></div>
      <nav className="platform-nav" aria-label="Platform navigation">
        {allowed.map(([key, item]) => { const Icon=icons[key], href=hrefFor(key), active=href === "/" ? pathname === "/" : pathname.startsWith(href); return <Link key={key} href={href} prefetch={false} aria-current={active ? "page" : undefined} title={collapsed ? item.title : undefined} onClick={() => setMobileOpen(false)}><Icon/><span>{item.title}</span></Link> })}
      </nav>
      <div className="sidebar-foot"><ShieldCheck/><span><strong>Internal only</strong><small>Actions are audited</small></span></div>
      <button className="collapse-button desktop-only" onClick={() => setCollapsed((value) => !value)} aria-label={collapsed ? "Expand sidebar" : "Collapse sidebar"}>{collapsed ? <ChevronRight/> : <ChevronLeft/>}</button>
    </aside>
    <div ref={body} className="platform-body">
      <header className="platform-header">
        <button className="icon-button mobile-only" disabled={!interactive} onClick={() => setMobileOpen(true)} aria-label="Open menu"><Menu/></button>
        <button className="command-trigger" disabled={!interactive} onClick={() => setPaletteOpen(true)}><Search/><span>Search restaurants, branches, domains…</span><kbd>Ctrl K</kbd></button>
        <span className={`environment-badge environment-${(process.env.NEXT_PUBLIC_APP_ENVIRONMENT ?? "local").toLowerCase()}`}>{process.env.NEXT_PUBLIC_APP_ENVIRONMENT ?? "LOCAL"}</span>
        {context.permissions.includes("restaurants.create") && context.permissions.includes("onboarding.manage") ? <Link className="quick-create" href="/onboarding/new"><Plus/> <span>New restaurant</span></Link> : null}
        {context.permissions.includes("incidents.manage") || context.permissions.includes("deployments.manage") ? <AttentionMenu/> : null}
        <details className="account-menu"><summary><span>{context.displayName.slice(0,1).toUpperCase()}</span><div><strong>{context.displayName}</strong><small>{context.roleNames[0] ?? "Platform staff"}</small></div></summary><div><p>{context.email}</p><form action={signOutAction}><SubmitButton pendingLabel="Signing out…">Sign out</SubmitButton></form></div></details>
      </header>
      <main id="main-content" tabIndex={-1} className="platform-main">{children}</main>
    </div>
    {mobileOpen ? <button className="sidebar-scrim" onClick={() => setMobileOpen(false)} aria-label="Close menu"/> : null}
    {paletteOpen ? <CommandPalette onClose={() => setPaletteOpen(false)} destinations={allowed.map(([key, item]) => ({ label: item.title, href: hrefFor(key) }))}/> : null}
  </div>
}
