"use client"
import { useEffect, useRef, useState } from "react"
import Link from "next/link"
import { Search, X } from "lucide-react"
import type { SearchResult } from "@/lib/search"

export function CommandPalette({ onClose, destinations }: { onClose: () => void; destinations: { label: string; href: string }[] }) {
  const dialog = useRef<HTMLDialogElement>(null)
  const [query, setQuery] = useState("")
  const [page, setPage] = useState(0)
  const [result, setResult] = useState<{ results: SearchResult[]; hasMore: boolean; error?: string }>({ results: [], hasMore: false })
  const [pending, setPending] = useState(false)
  const [selected, setSelected] = useState(0)
  const [retry, setRetry] = useState(0)
  useEffect(() => {
    const trigger = document.activeElement as HTMLElement
    dialog.current?.showModal()
    return () => trigger?.focus()
  }, [])
  useEffect(() => {
    if (query.trim().length < 2) return
    const controller = new AbortController()
    const timer = window.setTimeout(async () => {
      setPending(true)
      try {
        const response = await fetch(`/api/search?q=${encodeURIComponent(query)}&page=${page}`, { signal: controller.signal, cache: "no-store" })
        if (!response.ok) throw new Error("unavailable")
        const data = await response.json()
        if (!controller.signal.aborted) { setResult(data); setSelected(0) }
      } catch {
        if (!controller.signal.aborted) setResult({ results: [], hasMore: false, error: "Search couldn’t load. Please try again." })
      } finally { if (!controller.signal.aborted) setPending(false) }
    }, 250)
    return () => { clearTimeout(timer); controller.abort() }
  }, [query, page, retry])
  const items = query.trim().length < 2 ? destinations.map((item, index) => ({ ...item, group: "Destinations", id: String(index), detail: "" })) : pending ? [] : result.results
  return <dialog ref={dialog} className="command-palette search-dialog" aria-labelledby="search-title" onCancel={onClose} onKeyDown={event => {
    if (event.target instanceof HTMLButtonElement) return
    if (event.key === "ArrowDown" || event.key === "ArrowUp") { event.preventDefault(); setSelected(value => Math.max(0, Math.min(items.length - 1, value + (event.key === "ArrowDown" ? 1 : -1)))) }
    if (event.key === "Enter" && event.target instanceof HTMLInputElement) { event.preventDefault(); dialog.current?.querySelector<HTMLAnchorElement>(`[data-search-index="${selected}"]`)?.click() }
  }}>
    <h2 id="search-title" className="sr-only">Search QaziPro</h2>
    <div className="palette-input"><Search/><input autoFocus aria-label="Search restaurants, owners, branches and domains" placeholder="Search your workspace…" value={query} onChange={event => { setQuery(event.target.value); setPage(0); setSelected(0); setResult({ results: [], hasMore: false }); setPending(event.target.value.trim().length >= 2) }}/><button type="button" className="icon-button" onClick={onClose} aria-label="Close search"><X/></button></div>
    <div className="search-results" aria-busy={pending}>
      {pending && query.trim().length >= 2 ? <p role="status">Searching…</p> : null}
      {!pending && result.error ? <div role="alert"><p>{result.error}</p><button className="button button-secondary" onClick={() => setRetry(value => value + 1)}>Try again</button></div> : null}
      {!pending && query.trim().length >= 2 && !result.error && !items.length ? <p role="status">No matching records. Try a name, email or hostname.</p> : null}
      {items.map((item, index) => <div key={item.id}>{index === 0 || items[index - 1].group !== item.group ? <h3>{item.group}</h3> : null}<Link prefetch={false} className={`search-result ${index === selected ? "is-selected" : ""}`} data-search-index={index} href={item.href} onClick={onClose} onFocus={() => setSelected(index)}><strong>{item.label}</strong><small>{item.detail}</small></Link></div>)}
      {!pending && query.trim().length >= 2 ? <div className="dialog-actions">{page > 0 ? <button className="button button-secondary" onClick={() => { setPending(true); setPage(value => value - 1) }}>Previous results</button> : null}{result.hasMore ? <button className="button button-secondary" onClick={() => { setPending(true); setPage(value => value + 1) }}>More results</button> : null}</div> : null}
    </div>
  </dialog>
}
