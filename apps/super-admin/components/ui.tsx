import type { ReactNode } from "react"
import Link from "next/link"
import { AlertTriangle, ArrowUpRight, Database, Plus } from "lucide-react"
import { statusTone } from "@/lib/status-tone"

export function PageHeader({ eyebrow, title, description, actions }: { eyebrow: string; title: string; description: string; actions?: ReactNode }) {
  return <header className="page-header"><div><p className="eyebrow">{eyebrow}</p><h1>{title}</h1><p>{description}</p></div>{actions ? <div className="page-actions">{actions}</div> : null}</header>
}

export function StatusBadge({ value }: { value: unknown }) {
  const label = String(value ?? "UNKNOWN").replaceAll("_", " ")
  const tone = statusTone(value)
  return <span className={`status status-${tone}`}>{label}</span>
}

export function DataNotice({ message }: { message: string }) {
  return <div className="data-notice" role="status"><AlertTriangle/><div><strong>Environment setup required</strong><p>{message}</p></div></div>
}

export function EmptyState({ title, detail, action }: { title: string; detail: string; action?: { href: string; label: string } }) {
  return <section className="empty-state"><div><Database/></div><h2>{title}</h2><p>{detail}</p>{action ? <Link className="button" href={action.href}><Plus/>{action.label}</Link> : null}</section>
}

export function Value({ children }: { children: ReactNode }) {
  return <span className="cell-value">{children ?? "—"}</span>
}

export function DetailLink({ href, children }: { href: string; children: ReactNode }) {
  return <Link className="detail-link" href={href}>{children}<ArrowUpRight/></Link>
}
