"use client"

import type { OrderType } from "@/types"

export function OrderTypeToggle({
  value,
  onChange,
  label = "Order type",
}: {
  value: OrderType
  onChange: (value: OrderType) => void
  label?: string
}) {
  if (value === "dine-in") return <div className="order-type" role="group" aria-label={label}><button type="button" className="is-selected" aria-pressed="true">Dine-in · Table QR</button></div>
  return (
    <div className="order-type" role="group" aria-label={label}>
      {(["delivery", "pickup"] as const).map((option) => (
        <button
          key={option}
          type="button"
          className={value === option ? "is-selected" : undefined}
          aria-pressed={value === option}
          onClick={() => onChange(option)}
        >
          {option[0].toUpperCase() + option.slice(1)}
        </button>
      ))}
    </div>
  )
}
