import type { OrderStatus } from "./contracts"

export type OrderChannel = "WEBSITE" | "POS" | "INTEGRATION"
export type OperationalOrderType = "DELIVERY" | "PICKUP" | "TAKEAWAY" | "DINE_IN"
export type PaymentTransactionStatus = "UNPAID" | "PENDING" | "AUTHORIZED" | "PAID" | "FAILED" | "CANCELLED" | "PARTIALLY_REFUNDED" | "REFUNDED"
export type StockMovementType = "PURCHASE" | "SALE_CONSUMPTION" | "WASTAGE" | "ADJUSTMENT" | "RETURN" | "TRANSFER"
export type RegisterShiftStatus = "OPEN" | "CLOSED"

export const nextOrderStatuses: Record<OrderStatus, readonly OrderStatus[]> = {
  RECEIVED: ["CONFIRMED", "CANCELLED"],
  CONFIRMED: ["PREPARING", "CANCELLED"],
  PREPARING: ["READY", "CANCELLED"],
  READY: ["OUT_FOR_DELIVERY", "DELIVERED", "CANCELLED"],
  OUT_FOR_DELIVERY: ["DELIVERED", "CANCELLED"],
  DELIVERED: [],
  CANCELLED: [],
}

export function formatPkr(value: number) {
  return new Intl.NumberFormat("en-PK", { style: "currency", currency: "PKR", maximumFractionDigits: 0 }).format(Math.round(value))
}

export function calculateCashChange(total: number, received: number) {
  const normalizedTotal = Math.max(0, Math.round(total))
  const normalizedReceived = Math.max(0, Math.round(received))
  return normalizedReceived >= normalizedTotal ? normalizedReceived - normalizedTotal : null
}
