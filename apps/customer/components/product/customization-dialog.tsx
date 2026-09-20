"use client"

import Image from "next/image"
import { Minus, Plus, X } from "lucide-react"
import { motion } from "motion/react"
import { useEffect, useMemo, useRef, useState } from "react"

import { Button } from "@/components/ui/button"
import { useBodyScrollLock } from "@/hooks/use-body-scroll-lock"
import { formatRupees } from "@/lib/format"
import { useHydrationSafeReducedMotion } from "@/lib/motion/use-hydration-safe-reduced-motion"
import type { CartLine, Product, ProductModifierGroup } from "@/types"

type AddLine = Omit<CartLine, "lineId">

function initialSelections(product: Product) {
  return Object.fromEntries((product.modifierGroups ?? []).map((group) => {
    const defaults = group.options.filter((option) => option.isDefault).map((option) => option.id)
    const requiredFallback = group.required && defaults.length === 0 && group.options[0] ? [group.options[0].id] : []
    return [group.id, group.selection === "single" ? (defaults.slice(0, 1).length ? defaults.slice(0, 1) : requiredFallback) : defaults]
  })) as Record<string, string[]>
}

function OptionGroupControl({ group, value, onChange }: { group: ProductModifierGroup; value: string[]; onChange: (id: string) => void }) {
  return (
    <fieldset className="customization-group">
      <legend><span>{group.label}</span><em>{group.required ? "Required" : "Optional"}</em></legend>
      <div className="option-grid">{group.options.map((option) => {
        const checked = value.includes(option.id)
        return (
          <label key={option.id} className={checked ? "option-card is-selected" : "option-card"}>
            <input type={group.selection === "single" ? "radio" : "checkbox"} name={group.selection === "single" ? group.id : undefined} checked={checked} onChange={() => onChange(option.id)} />
            {option.image && <Image className="addon-thumbnail" src={option.image} alt="" width={48} height={48} unoptimized/>}<span>{option.label}</span><small>{option.priceDelta ? `+ ${formatRupees(option.priceDelta)}` : "Included"}</small>
          </label>
        )
      })}</div>
    </fieldset>
  )
}

function CustomizationDialogContent({ product, onClose, onAdd }: { product: Product; onClose: () => void; onAdd: (line: AddLine) => void }) {
  const dialogRef = useRef<HTMLDialogElement>(null)
  const previousFocusRef = useRef<HTMLElement | null>(null)
  const reduceMotion = Boolean(useHydrationSafeReducedMotion())
  const [selections, setSelections] = useState(() => initialSelections(product))
  const [variantId, setVariantId] = useState(() => product.variants?.find((variant) => variant.isDefault)?.id ?? product.variants?.[0]?.id ?? null)
  const [quantity, setQuantity] = useState(1)
  const groups = useMemo(() => product.modifierGroups ?? [], [product.modifierGroups])

  useBodyScrollLock(true)

  useEffect(() => {
    const dialog = dialogRef.current
    if (!dialog) return
    previousFocusRef.current = document.activeElement instanceof HTMLElement ? document.activeElement : null
    if (!dialog.open) dialog.showModal()
    return () => {
      if (dialog.open) dialog.close()
      previousFocusRef.current?.focus()
    }
  }, [])

  const selectedOptions = useMemo(() => groups.flatMap((group) => (selections[group.id] ?? []).flatMap((optionId) => {
    const option = group.options.find((candidate) => candidate.id === optionId)
    return option ? [{ group, option }] : []
  })), [groups, selections])
  const selectedVariant = product.variants?.find((variant) => variant.id === variantId)
  const unitPrice = product.price + (selectedVariant?.priceDelta ?? 0) + selectedOptions.reduce((sum, entry) => sum + entry.option.priceDelta, 0)
  const isValid = groups.every((group) => {
    const count = selections[group.id]?.length ?? 0
    return count >= group.minSelections && (group.maxSelections === null || count <= group.maxSelections)
  })

  const updateGroup = (group: ProductModifierGroup, id: string) => {
    setSelections((current) => {
      const selected = current[group.id] ?? []
      if (group.selection === "single") return { ...current, [group.id]: [id] }
      if (selected.includes(id)) return { ...current, [group.id]: selected.filter((value) => value !== id) }
      if (group.maxSelections !== null && selected.length >= group.maxSelections) return current
      return { ...current, [group.id]: [...selected, id] }
    })
  }

  const add = () => {
    if (!isValid) return
    onAdd({
      itemKind: "product",
      productId: product.id,
      name: product.name,
      unitPrice,
      quantity,
      options: [...(selectedVariant ? [`Variant: ${selectedVariant.name}`] : []), ...selectedOptions.map(({ group, option }) => `${group.label}: ${option.label}`)],
      modifierSelections: selectedOptions.map(({ group, option }) => ({ groupId: group.id, optionId: option.id })),
      variantId: selectedVariant?.id,
      variantName: selectedVariant?.name,
      image: product.image,
    })
  }

  return (
    <dialog ref={dialogRef} className="ip-dialog customization-dialog" aria-labelledby="customization-title" onCancel={(event) => { event.preventDefault(); onClose() }} onClick={(event) => { if (event.target === event.currentTarget) onClose() }}>
      <motion.div className="customization-modal" initial={reduceMotion ? false : { opacity: 0, y: 12, scale: 0.985 }} animate={{ opacity: 1, y: 0, scale: 1 }} transition={{ duration: reduceMotion ? 0 : 0.24, ease: [0.22, 1, 0.36, 1] }}>
        <button type="button" className="icon-button customization-close" onClick={onClose} aria-label="Close customization"><X aria-hidden="true" /></button>
        <div className="sheet-handle" aria-hidden="true" />
        <div className="customization-visual"><Image src={product.image} fill unoptimized sizes="(max-width: 767px) 100vw, 48vw" alt={product.name} priority /></div>
        <div className="customization-config">
          <header><span>CUSTOMIZE YOUR ORDER</span><h2 id="customization-title">{product.name}</h2><p>{product.description}</p><strong>From {formatRupees(product.price)}</strong></header>
          <div className="customization-options">
            {Boolean(product.variants?.length) && <fieldset className="customization-group"><legend><span>Choose a variant</span><em>Required</em></legend><div className="option-grid">{product.variants?.map((variant) => <label key={variant.id} className={variant.id === variantId ? "option-card is-selected" : "option-card"}><input type="radio" name="product-variant" checked={variant.id === variantId} onChange={() => setVariantId(variant.id)} /><span>{variant.name}</span><small>{variant.priceDelta ? `+ ${formatRupees(variant.priceDelta)}` : "Base price"}</small></label>)}</div></fieldset>}
            {groups.map((group) => <OptionGroupControl key={group.id} group={group} value={selections[group.id] ?? []} onChange={(id) => updateGroup(group, id)} />)}
          </div>
          <footer className="customization-action">
            <div className="quantity-control" aria-label="Quantity"><button type="button" onClick={() => setQuantity((value) => Math.max(1, value - 1))} aria-label="Decrease quantity"><Minus aria-hidden="true" /></button><motion.output key={quantity} initial={reduceMotion ? false : { opacity: 0.55, y: 3 }} animate={{ opacity: 1, y: 0 }} aria-live="polite">{quantity}</motion.output><button type="button" onClick={() => setQuantity((value) => Math.min(20, value + 1))} aria-label="Increase quantity"><Plus aria-hidden="true" /></button></div>
            <Button size="lg" disabled={!isValid} onClick={add}>Add to Cart — {formatRupees(unitPrice * quantity)}</Button>
          </footer>
        </div>
      </motion.div>
    </dialog>
  )
}

export function CustomizationDialog({ products, productId, onClose, onAdd }: { products: Product[]; productId: string | null; onClose: () => void; onAdd: (line: AddLine) => void }) {
  if (!productId) return null
  const product = products.find((candidate) => candidate.id === productId)
  if (!product) return null
  return <CustomizationDialogContent key={productId} product={product} onClose={onClose} onAdd={onAdd} />
}
