"use client"

import Image from "next/image"
import { Heart } from "lucide-react"
import { useRef, useState } from "react"
import { useRouter } from "next/navigation"

import { useApp } from "@/components/providers/app-provider"
import { Button } from "@/components/ui/button"
import { formatRupees } from "@/lib/format"
import type { Product } from "@/types"
import { createClient } from "@/lib/supabase/client"

export function ProductCard({ product, compact = false }: { product: Product; compact?: boolean }) {
  const { addCartLine, openProduct, authUserId } = useApp()
  const router = useRouter()
  const [favouriteState, setFavouriteState] = useState<{ scope: string | null; saved: boolean }>({ scope: null, saved: false })
  const [favouriteBusy, setFavouriteBusy] = useState(false)
  const favouriteInFlight = useRef(false)
  const [favouriteError, setFavouriteError] = useState("")
  const favourite = favouriteState.scope === authUserId && favouriteState.saved

  const handleAdd = () => {
    if (!product.available) return
    if (product.customizable) {
      openProduct(product.id)
      return
    }
    addCartLine({
      itemKind: "product",
      productId: product.id,
      name: product.name,
      unitPrice: product.price,
      quantity: 1,
      options: [],
      image: product.image,
    })
  }

  const toggleFavourite = async () => {
    if (favouriteInFlight.current) return
    favouriteInFlight.current = true
    setFavouriteError("")
    setFavouriteBusy(true)
    try {
      const { data } = await createClient().auth.getUser()
      if (!data.user) { router.push("/account?notice=favourite"); return }
      const response = await fetch(`/api/favourites${favourite ? `?productId=${encodeURIComponent(product.id)}` : ""}`, {
        method: favourite ? "DELETE" : "POST",
        headers: { "Content-Type": "application/json", Accept: "application/json" },
        body: favourite ? undefined : JSON.stringify({ productId: product.id }),
      })
      if (response.ok) setFavouriteState({ scope: authUserId, saved: !favourite })
      else setFavouriteError("We couldn't update your favourites. Please try again.")
    } catch {
      setFavouriteError("Check your connection and try again.")
    } finally { favouriteInFlight.current = false; setFavouriteBusy(false) }
  }

  return (
    <article id={`product-${product.id}${compact ? "-mobile" : ""}`} data-product-id={product.id} className={`product-card${compact ? " product-card--compact" : ""}${!product.available ? " is-unavailable" : ""}`}>
      <div className="product-card__image">
        <button className="product-card__detail-trigger" type="button" onClick={() => openProduct(product.id)} aria-label={`View ${product.name} details`}><Image src={product.image} fill unoptimized sizes={compact ? "108px" : "(max-width: 1199px) 30vw, 310px"} alt="" /></button>
        <button type="button" className={`product-card__favourite${favourite ? " is-active" : ""}`} aria-label={favourite ? `Remove ${product.name} from favourites` : `Save ${product.name} to favourites`} aria-pressed={favourite} onClick={(event) => { event.stopPropagation(); void toggleFavourite() }} disabled={favouriteBusy}><Heart fill={favourite ? "currentColor" : "none"} aria-hidden="true" /></button>
      </div>
      <div className="product-card__content">
        {product.badge && <span className={`product-badge badge-${product.badge.toLowerCase().replaceAll(" ", "-")}`}>{product.badge}</span>}
        {!product.available && <span className="product-badge badge-unavailable">Unavailable</span>}
        <h3><button type="button" onClick={() => openProduct(product.id)}>{product.name}</button></h3>
        {favouriteError && <p role="alert" className="product-card__error">{favouriteError}</p>}
        {!compact && <p>{product.description}</p>}
        <div className="product-card__purchase">
          <div className="product-price">
            <strong>{formatRupees(product.price)}</strong>
            {product.oldPrice && <del>{formatRupees(product.oldPrice)}</del>}
          </div>
          <Button disabled={!product.available} onClick={handleAdd}>
            {product.available ? "Add" : "Sold out"}
          </Button>
        </div>
      </div>
    </article>
  )
}
