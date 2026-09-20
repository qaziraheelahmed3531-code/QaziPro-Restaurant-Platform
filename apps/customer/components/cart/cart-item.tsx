"use client"

import Image from "next/image"
import { motion } from "motion/react"
import { MOTION_DURATION, MOTION_EASE } from "@italian-pizza/shared/motion"

import { QuantityControl } from "@/components/cart/quantity-control"
import { formatRupees } from "@/lib/format"
import type { CartLine } from "@/types"

export function CartItem({ line, onQuantity, onRemove }: { line: CartLine; onQuantity: (quantity: number) => void; onRemove: () => void }) {
  return (
    <motion.article className="cart-item" layout initial={{opacity:0,scale:.985}} animate={{opacity:1,scale:1}} exit={{opacity:0,scale:.985}} transition={{duration:MOTION_DURATION.fast,ease:MOTION_EASE}}>
      <div className="cart-item__main">
        <Image src={line.image} width={96} height={96} unoptimized alt={line.name} />
        <div className="cart-item__copy">
          <h2>{line.name}</h2>
          {line.options.length > 0 && <p>{line.options.join(" · ")}</p>}
        </div>
        <strong>{formatRupees(line.unitPrice * line.quantity)}</strong>
      </div>
      <div className="cart-item__actions">
        <QuantityControl value={line.quantity} onChange={onQuantity} />
        <button type="button" className="remove-action" onClick={onRemove}>Remove</button>
      </div>
    </motion.article>
  )
}
