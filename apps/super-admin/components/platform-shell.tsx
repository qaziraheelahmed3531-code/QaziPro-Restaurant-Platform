"use client"

import { useEffect, useMemo, useState, type ReactNode } from "react"
import Image from "next/image"
import Link from "next/link"
import { usePathname, useRouter } from "next/navigation"
import {
  Activity, AppWindow, Bell, Blocks, Building2, ChevronLeft, ChevronRight,
  CircleDollarSign, ClipboardCheck, CloudCog, Command, FileClock, Inbox,
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

export function PlatformShell({ context, children }: { context: PlatformContext; children: ReactNode }) {
  const pathname = usePathname(), router = useRouter()
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

  return <div className={`platform-shell ${collapsed ? "is-collapsed" : ""}`}>
    <aside className={`platform-sidebar ${mobileOpen ? "is-open" : ""}`}>
      <div className="platform-brand"><Image src="/qazipro-logo.png" alt="QaziPro" width={44} height={44}/><span><strong>QaziPro</strong><small>CONTROL CENTER</small></span><button className="icon-button mobile-only" onClick={() => setMobileOpen(false)} aria-label="Close menu"><X/></button></div>
      <nav className="platform-nav" aria-label="Platform navigation">
        {allowed.map(([key, item]) => { const Icon=icons[key], href=hrefFor(key), active=href === "/" ? pathname === "/" : pathname.startsWith(href); return <Link key={key} href={href} aria-current={active ? "page" : undefined} title={collapsed ? item.title : undefined} onClick={() => setMobileOpen(false)}><Icon/><span>{item.title}</span></Link> })}
      </nav>
      <div className="sidebar-foot"><ShieldCheck/><span><strong>Internal only</strong><small>Actions are audited</small></span></div>
      <button className="collapse-button desktop-only" onClick={() => setCollapsed((value) => !value)} aria-label={collapsed ? "Expand sidebar" : "Collapse sidebar"}>{collapsed ? <ChevronRight/> : <ChevronLeft/>}</button>
    </aside>
    <div className="platform-body">
      <header className="platform-header">
        <button className="icon-button mobile-only" onClick={() => setMobileOpen(true)} aria-label="Open menu"><Menu/></button>
        <button className="command-trigger" onClick={() => setPaletteOpen(true)}><Search/><span>Search restaurants, branches, domains…</span><kbd>Ctrl K</kbd></button>
        <span className={`environment-badge environment-${(process.env.NEXT_PUBLIC_APP_ENVIRONMENT ?? "local").toLowerCase()}`}>{process.env.NEXT_PUBLIC_APP_ENVIRONMENT ?? "LOCAL"}</span>
        {context.permissions.includes("restaurants.create") && context.permissions.includes("onboarding.manage") ? <Link className="quick-create" href="/onboarding/new"><Plus/> <span>New restaurant</span></Link> : null}
        <Link className="icon-button" href="/health" aria-label="Attention center"><Bell/></Link>
        <details className="account-menu"><summary><span>{context.displayName.slice(0,1).toUpperCase()}</span><div><strong>{context.displayName}</strong><small>{context.roleNames[0] ?? "Platform staff"}</small></div></summary><div><p>{context.email}</p><form action={signOutAction}><button type="submit">Sign out</button></form></div></details>
      </header>
      <main className="platform-main">{children}</main>
    </div>
    {mobileOpen ? <button className="sidebar-scrim" onClick={() => setMobileOpen(false)} aria-label="Close menu"/> : null}
    {paletteOpen ? <div className="palette-backdrop" role="presentation" onMouseDown={() => setPaletteOpen(false)}><section className="command-palette" role="dialog" aria-modal="true" aria-label="Command palette" onMouseDown={(event) => event.stopPropagation()}><div className="palette-input"><Command/><input autoFocus placeholder="Type a destination or restaurant name" onKeyDown={(event) => { if (event.key === "Enter" && event.currentTarget.value.trim() && context.permissions.includes("restaurants.view")) { router.push(`/restaurants?q=${encodeURIComponent(event.currentTarget.value.trim())}`); setPaletteOpen(false) } }}/><button onClick={() => setPaletteOpen(false)} aria-label="Close"><X/></button></div><p>QUICK ACTIONS</p><div className="palette-actions">{context.permissions.includes("restaurants.create") && context.permissions.includes("onboarding.manage") ? <Link href="/onboarding/new" onClick={() => setPaletteOpen(false)}><Plus/>Create restaurant</Link> : null}{allowed.slice(0,7).map(([key,item]) => {const Icon=icons[key];return <Link key={key} href={hrefFor(key)} onClick={() => setPaletteOpen(false)}><Icon/>{item.title}</Link>})}</div></section></div> : null}
  </div>
}
