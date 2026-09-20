"use client"

import Image from "next/image"
import { AnimatePresence, motion } from "motion/react"
import { Search, X } from "lucide-react"
import { useEffect, useMemo, useRef, useState, type KeyboardEvent } from "react"

import { formatRupees } from "@/lib/format"
import { useHydrationSafeReducedMotion } from "@/lib/motion/use-hydration-safe-reduced-motion"
import { scrollToElement, scrollToHomeSection } from "@/lib/navigation/home-sections"
import type { Deal, Product } from "@/types"

type SearchItem = {
  id: string
  name: string
  category: string
  description: string
  price: number
  image: string
  searchText: string
}

function normalize(value: string) {
  return value.toLowerCase().replace(/[^a-z0-9]+/g, " ").trim()
}

function createSearchableItems(products: Product[], deals: Deal[]): SearchItem[] {
 return [
  ...products.map((product) => ({
    id: product.id,
    name: product.name,
    category: product.category,
    description: product.description,
    price: product.price,
    image: product.image,
    searchText: normalize([product.name, product.description, product.category, ...(product.tags ?? []), ...(product.modifierGroups?.flatMap((group) => group.options.map((option) => option.label)) ?? [])].join(" ")),
  })),
  ...deals.map((deal) => ({
    id: deal.id,
    name: deal.name,
    category: "Deals",
    description: deal.description,
    price: deal.price,
    image: deal.image,
    searchText: normalize([deal.name, deal.description, "deals offers bundles"].join(" ")),
  })),
 ]
}

function revealProduct(item: SearchItem, reduceMotion: boolean) {
  const candidates = Array.from(document.querySelectorAll<HTMLElement>(`[data-product-id="${item.id}"]`))
  const target = candidates.find((element) => element.offsetParent !== null) ?? candidates[0]
  if (!target) return
  scrollToElement(target, reduceMotion, "center")
  target.classList.remove("is-search-highlighted")
  void target.offsetWidth
  target.classList.add("is-search-highlighted")
  target.addEventListener("animationend", () => target.classList.remove("is-search-highlighted"), { once: true })
}

function ProductSearchPrompt({ names, active }: { names: string[]; active: boolean }) {
  const [productIndex, setProductIndex] = useState(0)
  const [characterCount, setCharacterCount] = useState(0)
  const [deleting, setDeleting] = useState(false)
  const name = names[productIndex % Math.max(names.length, 1)] ?? "the menu"
  const phrase = `Search for ${name}`

  useEffect(() => {
    if (!active || names.length === 0) return
    let delay = deleting ? 34 : 72
    if (!deleting && characterCount >= phrase.length) delay = 1350
    if (deleting && characterCount === 0) delay = 240
    const timer = window.setTimeout(() => {
      if (!deleting && characterCount < phrase.length) setCharacterCount(value => value + 1)
      else if (!deleting) setDeleting(true)
      else if (characterCount > 0) setCharacterCount(value => value - 1)
      else {
        setProductIndex(value => (value + 1) % names.length)
        setDeleting(false)
      }
    }, delay)
    return () => window.clearTimeout(timer)
  }, [active, characterCount, deleting, names.length, phrase.length])

  if (!active) return null
  return <span data-product-prompt={name} data-product-prompt-index={productIndex % Math.max(names.length, 1)} data-product-prompt-count={names.length}>{phrase.slice(0, characterCount)}<i className="menu-search-placeholder__caret" aria-hidden="true" /></span>
}

export function MenuSearch({ products, deals }: { products: Product[]; deals: Deal[] }) {
  const reduceMotion = Boolean(useHydrationSafeReducedMotion())
  const sectionRef = useRef<HTMLElement>(null)
  const inputRef = useRef<HTMLInputElement>(null)
  const [query, setQuery] = useState("")
  const [focused, setFocused] = useState(false)
  const [open, setOpen] = useState(false)
  const [activeIndex, setActiveIndex] = useState(-1)
  const [searchVisible, setSearchVisible] = useState(true)
  const searchableItems = useMemo(() => createSearchableItems(products, deals), [deals, products])

  const promptNames = useMemo(() => [...new Set([
    ...products.filter((product) => product.available).map((product) => product.name.trim()),
    ...deals.filter((deal) => deal.available !== false).map((deal) => deal.name.trim()),
  ].filter(Boolean))], [deals, products])
  const results = useMemo(() => {
    const normalizedQuery = normalize(query)
    if (!normalizedQuery) return []
    const terms = normalizedQuery.split(" ")
    return searchableItems.filter((item) => terms.every((term) => item.searchText.includes(term))).slice(0, 8)
  }, [query, searchableItems])

  useEffect(() => {
    const section = sectionRef.current
    if (!section) return
    const observer = new IntersectionObserver(([entry]) => setSearchVisible(entry.isIntersecting), { threshold: 0.12 })
    observer.observe(section)
    return () => observer.disconnect()
  }, [])

  const choose = (item: SearchItem) => {
    setQuery(item.name)
    setOpen(false)
    setActiveIndex(-1)
    revealProduct(item, reduceMotion)
  }

  const handleKeyDown = (event: KeyboardEvent<HTMLInputElement>) => {
    if (event.key === "Escape") {
      setOpen(false)
      setActiveIndex(-1)
      return
    }
    if (!results.length) return
    if (event.key === "ArrowDown") {
      event.preventDefault()
      setOpen(true)
      setActiveIndex((index) => Math.min(results.length - 1, index + 1))
    } else if (event.key === "ArrowUp") {
      event.preventDefault()
      setActiveIndex((index) => Math.max(0, index - 1))
    } else if (event.key === "Enter" && activeIndex >= 0) {
      event.preventDefault()
      choose(results[activeIndex])
    }
  }

  const returnToSearch = () => {
    scrollToHomeSection("search", reduceMotion)
    window.requestAnimationFrame(() => inputRef.current?.focus({ preventScroll: true }))
  }

  const showDropdown = open && query.trim().length > 0

  return (
    <>
      <section ref={sectionRef} className="menu-search-section" id="search" aria-labelledby="menu-search-title">
        <h2 className="sr-only" id="menu-search-title">Search the menu</h2>
        <div className="menu-search-control">
          <Search aria-hidden="true" />
          <div className="menu-search-placeholder" aria-hidden="true">
            <ProductSearchPrompt names={promptNames} active={!query && !focused} />
          </div>
          <input
            ref={inputRef}
            value={query}
            onChange={(event) => { setQuery(event.target.value); setOpen(true); setActiveIndex(-1) }}
            onFocus={() => { setFocused(true); if (query) setOpen(true) }}
            onBlur={(event) => { setFocused(false); if (!sectionRef.current?.contains(event.relatedTarget as Node | null)) setOpen(false) }}
            onKeyDown={handleKeyDown}
            placeholder={focused ? "Type a pizza, burger or deal" : ""}
            aria-label="Search menu items"
            role="combobox"
            aria-autocomplete="list"
            aria-expanded={showDropdown}
            aria-controls="menu-search-results"
            aria-activedescendant={activeIndex >= 0 ? `menu-search-result-${activeIndex}` : undefined}
            autoComplete="off"
          />
          {query && <button type="button" aria-label="Clear menu search" onClick={() => { setQuery(""); setOpen(false); inputRef.current?.focus() }}><X aria-hidden="true" /></button>}
        </div>

        <AnimatePresence>
          {showDropdown && (
            <motion.div id="menu-search-results" className="menu-search-results" role="listbox" initial={reduceMotion ? false : { opacity: 0, y: -6 }} animate={{ opacity: 1, y: 0 }} exit={reduceMotion ? undefined : { opacity: 0, y: -4 }} transition={{ duration: reduceMotion ? 0 : 0.17 }}>
              {results.length > 0 ? results.map((item, index) => (
                <button
                  key={item.id}
                  id={`menu-search-result-${index}`}
                  type="button"
                  role="option"
                  aria-selected={activeIndex === index}
                  className={activeIndex === index ? "is-active" : undefined}
                  onMouseDown={(event) => event.preventDefault()}
                  onMouseEnter={() => setActiveIndex(index)}
                  onClick={() => choose(item)}
                >
                  <span className="menu-search-result-image"><Image src={item.image} fill unoptimized sizes="52px" alt="" /></span>
                  <span><strong>{item.name}</strong><small>{item.category}</small></span>
                  <b>{formatRupees(item.price)}</b>
                </button>
              )) : <p>No menu item found for &ldquo;{query.trim()}&rdquo;</p>}
            </motion.div>
          )}
        </AnimatePresence>
      </section>

      <AnimatePresence>
        {!searchVisible && (
          <motion.button className="floating-search-button" type="button" aria-label="Return to menu search" onClick={returnToSearch} initial={reduceMotion ? false : { opacity: 0, scale: 0.9, y: 8 }} animate={{ opacity: 1, scale: 1, y: 0 }} exit={reduceMotion ? undefined : { opacity: 0, scale: 0.94, y: 5 }} transition={{ duration: reduceMotion ? 0 : 0.18 }}>
            <Search aria-hidden="true" /><span>Search menu</span>
          </motion.button>
        )}
      </AnimatePresence>
    </>
  )
}
