export const orderStatuses = [
  "RECEIVED",
  "CONFIRMED",
  "PREPARING",
  "READY",
  "OUT_FOR_DELIVERY",
  "DELIVERED",
  "CANCELLED",
] as const

export type OrderStatus = (typeof orderStatuses)[number]
export type ServiceMode = "DELIVERY" | "PICKUP"
export type PaymentMethod = "CASH_ON_DELIVERY" | "ONLINE"
export type PaymentStatus = "UNPAID" | "PENDING" | "AUTHORIZED" | "PAID" | "FAILED" | "CANCELLED" | "PARTIALLY_REFUNDED" | "REFUNDED"
export type StaffRole = "OWNER" | "MANAGER" | "CASHIER" | "KITCHEN" | "WAITER" | "STAFF"
export type SelectionType = "SINGLE" | "MULTIPLE"

export type StorefrontModifierOption = {
  id: string
  name: string
  priceDelta: number
  isDefault: boolean
}

export type StorefrontModifierGroup = {
  id: string
  name: string
  selectionType: SelectionType
  required: boolean
  minSelections: number
  maxSelections: number | null
  options: StorefrontModifierOption[]
}

export type StorefrontProduct = {
  id: string
  slug: string
  name: string
  description: string
  categoryId: string
  categoryName: string
  basePrice: number
  salePrice: number | null
  oldPrice: number | null
  imageUrl: string
  badge: string | null
  available: boolean
  featured: boolean
  modifierGroups: StorefrontModifierGroup[]
}

export type CreateOrderModifierInput = {
  groupId: string
  optionId: string
}

export type CreateOrderItemInput = {
  itemKind?: "product" | "deal"
  productId: string
  quantity: number
  modifiers: CreateOrderModifierInput[]
}

export type CreateOrderInput = {
  branchId: string
  serviceMode: ServiceMode
  customerName: string
  customerPhone: string
  customerEmail?: string
  deliveryAreaId?: string
  deliveryAddress?: string
  deliveryInstructions?: string
  latitude?: number
  longitude?: number
  promoCode?: string
  paymentMethod: "CASH_ON_DELIVERY"
  items: CreateOrderItemInput[]
}
