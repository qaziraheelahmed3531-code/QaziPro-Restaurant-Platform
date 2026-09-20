"use client"

import Image from "next/image"

import { useApp } from "@/components/providers/app-provider"
import { Button } from "@/components/ui/button"
import { formatRupees } from "@/lib/format"
import type { Deal } from "@/types"

export function DealCard({ deal }: { deal: Deal }) {
  const { addCartLine } = useApp()
  return (
    <article id={`product-${deal.id}`} data-product-id={deal.id} className="deal-card">
      <div className="deal-card__image"><Image src={deal.image} fill unoptimized sizes="(max-width: 767px) 140px, 180px" alt={deal.name} /></div>
      <div className="deal-card__content">
        <span className="product-badge">Featured</span>
        <h3>{deal.name}</h3>
        <p>{deal.description}</p>
        <strong>{formatRupees(deal.price)}</strong>
        <small>Save {formatRupees(deal.savings)}</small>
        <Button disabled={deal.available === false} onClick={() => addCartLine({ itemKind: "deal", productId: deal.id, name: deal.name, unitPrice: deal.price, quantity: 1, options: [deal.description], image: deal.image })}>{deal.available === false ? "Sold out" : "Add deal"}</Button>
      </div>
    </article>
  )
}
