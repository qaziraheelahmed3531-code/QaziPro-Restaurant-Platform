import type { CartLine, OrderType } from "@/types"

export type LocalOrderStatus = "received" | "confirmed" | "preparing" | "ready" | "out-for-delivery" | "delivered" | "cancelled"

export type LocalOrder = {
  id: string
  tokenNumber?: number
  createdAt: string
  items: CartLine[]
  subtotal: number
  discount: number
  deliveryFee: number | null
  total: number
  deliveryAddress: string | null
  areaLabel: string | null
  serviceMode: OrderType
  paymentMethod: "cod"
  paymentStatus?: string
  riderName?: string | null
  riderTracking?: { riderName: string | null; latitude: number; longitude: number; accuracyM: number | null; heading: number | null; active: boolean; updatedAt: string } | null
  restaurantTracking?: { latitude: number; longitude: number; address: string | null } | null
  customerName: string
  customerPhone: string
  status: LocalOrderStatus
  branchName: string
}

export type CreateLocalOrderInput = Omit<LocalOrder, "id" | "createdAt" | "status" | "branchName">

const storageKey = "italian-pizza-local-orders-v1"
const updateEvent = "italian-pizza-orders-updated"

function isLocalOrder(value: unknown): value is LocalOrder {
  if (!value || typeof value !== "object") return false
  const order = value as Partial<LocalOrder>
  const statuses: LocalOrderStatus[] = ["received", "confirmed", "preparing", "ready", "out-for-delivery", "delivered", "cancelled"]
  return typeof order.id === "string" && typeof order.createdAt === "string" && Array.isArray(order.items) && typeof order.total === "number" && statuses.includes(order.status as LocalOrderStatus)
}

export function listLocalOrders(): LocalOrder[] {
  if (typeof window === "undefined") return []
  try {
    const parsed: unknown = JSON.parse(window.localStorage.getItem(storageKey) ?? "[]")
    return Array.isArray(parsed) ? parsed.filter(isLocalOrder).sort((a, b) => b.createdAt.localeCompare(a.createdAt)) : []
  } catch {
    return []
  }
}

export function getLocalOrder(id: string) {
  return listLocalOrders().find((order) => order.id.toLowerCase() === id.toLowerCase()) ?? null
}

function createOrderId(date = new Date()) {
  const dateCode = [String(date.getFullYear()).slice(-2), String(date.getMonth() + 1).padStart(2, "0"), String(date.getDate()).padStart(2, "0")].join("")
  const bytes = new Uint8Array(2)
  crypto.getRandomValues(bytes)
  const suffix = Array.from(bytes, (value) => value.toString(36).toUpperCase().padStart(2, "0")).join("").slice(0, 4)
  return `IP-${dateCode}-${suffix}`
}

export function createLocalOrder(input: CreateLocalOrderInput) {
  const order: LocalOrder = {
    ...input,
    id: createOrderId(),
    createdAt: new Date().toISOString(),
    status: "received",
    paymentStatus: "UNPAID",
    riderName: null,
    branchName: "Italian Pizza — Tarbela Ghazi",
  }
  const orders = listLocalOrders()
  window.localStorage.setItem(storageKey, JSON.stringify([order, ...orders]))
  window.dispatchEvent(new Event(updateEvent))
  return order
}

export function subscribeToLocalOrders(listener: () => void) {
  const handleStorage = (event: StorageEvent) => {
    if (event.key === storageKey) listener()
  }
  window.addEventListener("storage", handleStorage)
  window.addEventListener(updateEvent, listener)
  return () => {
    window.removeEventListener("storage", handleStorage)
    window.removeEventListener(updateEvent, listener)
  }
}
