import { useId } from "react"
import { AppLoader } from "@italian-pizza/shared/app-loader"

import { formatRupees } from "@/lib/format"
import type { OrderType } from "@/types"

export function PriceSummary({
  subtotal,
  discount,
  loyaltyDiscount = 0,
  deliveryFee,
  deliveryStatus,
  orderType,
  total,
  title = "Order summary",
}: {
  subtotal: number
  discount: number
  loyaltyDiscount?: number
  deliveryFee: number | null
  deliveryStatus: "idle" | "loading" | "success" | "unavailable"
  orderType: OrderType
  total: number
  title?: string
}) {
  const titleId = useId()
  const deliveryLabel = orderType === "pickup"
    ? "Pickup"
    : deliveryStatus === "loading"
      ? "Calculating…"
      : deliveryFee === 0
        ? "Free"
        : deliveryFee === null
          ? "Calculated at checkout"
          : formatRupees(deliveryFee)
  return (
    <section className="price-summary" aria-labelledby={titleId}>
      <h2 id={titleId}>{title}</h2>
      <dl>
        <div><dt>Subtotal</dt><dd>{formatRupees(subtotal)}</dd></div>
        <div><dt>{loyaltyDiscount > 0 ? "Promo discount" : "Discount"}</dt><dd className={discount > 0 ? "success-text" : undefined}>{discount > 0 ? `− ${formatRupees(discount)}` : "Rs 0"}</dd></div>
        {loyaltyDiscount > 0 && <div><dt>Loyalty coins</dt><dd className="success-text">− {formatRupees(loyaltyDiscount)}</dd></div>}
        <div><dt>Delivery</dt><dd className={deliveryFee === 0 ? "success-text" : undefined}><AppLoader active={deliveryStatus === "loading"} label="Calculating delivery" />{deliveryLabel}</dd></div>
        <div className="price-summary__total"><dt>Total</dt><dd>{formatRupees(total)}</dd></div>
      </dl>
    </section>
  )
}
