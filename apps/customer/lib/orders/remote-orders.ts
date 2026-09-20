"use client"

import type { CartLine } from "@/types"
import type { LocalOrder, LocalOrderStatus } from "@/lib/orders/local-orders"

const tokenKey = "italian-pizza-order-access-v1"

type ApiOrder = {
  order_number: string
  token_number?: number | null
  created_at: string
  status: string
  service_mode: "DELIVERY" | "PICKUP"
  payment_method: string
  payment_status: string
  rider_name?: string | null
  customer_name: string
  customer_phone: string
  delivery_area_name: string | null
  delivery_address: string | null
  subtotal: number
  discount: number
  delivery_fee: number
  total: number
  branches?: { name?: string; address?: string | null; formatted_address?: string | null; latitude?: number | null; longitude?: number | null } | Array<{ name?: string; address?: string | null; formatted_address?: string | null; latitude?: number | null; longitude?: number | null }> | null
  location_snapshot?: { restaurantName?:string;branchName?:string;branchAddress?:string;branchCity?:string;deliveryAreaName?:string;deliveryCity?:string;customerAddress?:string;restaurantLatitude?:number;restaurantLongitude?:number } | null
  rider_live_locations?: {latitude:number;longitude:number;accuracy_m:number|null;heading:number|null;is_active:boolean;recorded_at:string;updated_at:string} | Array<{latitude:number;longitude:number;accuracy_m:number|null;heading:number|null;is_active:boolean;recorded_at:string;updated_at:string}> | null
  order_items?: Array<{ id: string; product_id?: string | null; deal_id?: string | null; product_name: string; variant_id?: string | null; variant_name?: string | null; quantity: number; unit_price: number; order_item_modifiers?: Array<{ group_name: string; option_name: string }> }>
}

function status(value: string): LocalOrderStatus {
  const normalized = value.toLowerCase().replaceAll("_", "-")
  return (["received", "confirmed", "preparing", "ready", "out-for-delivery", "delivered", "cancelled"] as LocalOrderStatus[]).includes(normalized as LocalOrderStatus) ? normalized as LocalOrderStatus : "received"
}

function branchName(value: ApiOrder["branches"],snapshot?:ApiOrder["location_snapshot"]) {
  if(snapshot?.branchName)return snapshot.branchName
  const branch = Array.isArray(value) ? value[0] : value
  return branch?.name ?? "Restaurant"
}

export function normalizeApiOrder(order: ApiOrder): LocalOrder {
  const rawLocation=Array.isArray(order.rider_live_locations)?order.rider_live_locations[0]:order.rider_live_locations
  const branch=Array.isArray(order.branches)?order.branches[0]:order.branches
  const restaurantLatitude=Number(order.location_snapshot?.restaurantLatitude??branch?.latitude)
  const restaurantLongitude=Number(order.location_snapshot?.restaurantLongitude??branch?.longitude)
  const validRestaurantPoint=Number.isFinite(restaurantLatitude)&&Number.isFinite(restaurantLongitude)&&Math.abs(restaurantLatitude)<=90&&Math.abs(restaurantLongitude)<=180&&(restaurantLatitude!==0||restaurantLongitude!==0)
  const items: CartLine[] = (order.order_items ?? []).map((item) => ({
    lineId: item.id,
    itemKind: item.deal_id ? "deal" : "product",
    productId: item.deal_id ?? item.product_id ?? item.id,
    name: item.product_name,
    unitPrice: Number(item.unit_price),
    quantity: Number(item.quantity),
    options: [...(item.variant_name ? [`Variant: ${item.variant_name}`] : []), ...(item.order_item_modifiers ?? []).map((modifier) => `${modifier.group_name}: ${modifier.option_name}`)],
    variantId: item.variant_id ?? undefined,
    variantName: item.variant_name ?? undefined,
    image: "/images/products/cart-item-placeholder.svg",
  }))
  return {
    id: order.order_number,
    tokenNumber: order.token_number == null ? undefined : Number(order.token_number),
    createdAt: order.created_at,
    items,
    subtotal: Number(order.subtotal),
    discount: Number(order.discount),
    deliveryFee: Number(order.delivery_fee),
    total: Number(order.total),
    deliveryAddress: order.location_snapshot?.customerAddress??order.delivery_address,
    areaLabel: order.location_snapshot?.deliveryAreaName??order.delivery_area_name,
    serviceMode: order.service_mode === "PICKUP" ? "pickup" : "delivery",
    paymentMethod: "cod",
    paymentStatus: order.payment_status,
    riderName: order.rider_name??null,
    riderTracking: rawLocation ? {riderName:order.rider_name??null,latitude:Number(rawLocation.latitude),longitude:Number(rawLocation.longitude),accuracyM:rawLocation.accuracy_m==null?null:Number(rawLocation.accuracy_m),heading:rawLocation.heading==null?null:Number(rawLocation.heading),active:Boolean(rawLocation.is_active),updatedAt:rawLocation.recorded_at??rawLocation.updated_at} : null,
    restaurantTracking: validRestaurantPoint ? {latitude:restaurantLatitude,longitude:restaurantLongitude,address:order.location_snapshot?.branchAddress??branch?.formatted_address??branch?.address??null} : null,
    customerName: order.customer_name,
    customerPhone: order.customer_phone,
    status: status(order.status),
    branchName: branchName(order.branches,order.location_snapshot),
  }
}

function tokens(): Record<string, string> {
  try { return JSON.parse(window.localStorage.getItem(tokenKey) ?? "{}") as Record<string, string> } catch { return {} }
}

export function getOrderToken(orderNumber: string) {
  return tokens()[orderNumber] ?? null
}

export async function cancelRemoteOrder(orderNumber: string) {
  const token = getOrderToken(orderNumber)
  const response = await fetch(`/api/orders/${encodeURIComponent(orderNumber)}/cancel`, {
    method: "POST",
    headers: { Accept: "application/json", ...(token ? { "X-Order-Token": token } : {}) },
    cache: "no-store",
  })
  const result = await response.json() as { ok?: boolean; error?: string }
  if (!response.ok || !result.ok) throw new Error(result.error ?? "This order can no longer be cancelled.")
}

export async function createRemoteOrder(payload: unknown) {
  const response = await fetch("/api/orders", { method: "POST", headers: { "Content-Type": "application/json", Accept: "application/json" }, body: JSON.stringify(payload) })
  const result = await response.json() as { ok: boolean; error?: string; order?: { orderNumber: string; guestTrackingToken?: string | null } }
  if (!response.ok || !result.order) throw new Error(result.error ?? "The order could not be placed.")
  if (result.order.guestTrackingToken) {
    const current = tokens()
    current[result.order.orderNumber] = result.order.guestTrackingToken
    window.localStorage.setItem(tokenKey, JSON.stringify(current))
  }
  return result.order.orderNumber
}

export async function fetchRemoteOrders(options: { includeGuest?: boolean } = {}) {
  const response = await fetch("/api/orders", { headers: { Accept: "application/json" }, cache: "no-store" })
  const result = response.ok ? await response.json() as { orders?: ApiOrder[]; authenticated?: boolean } : {}
  const authenticated = (result.orders ?? []).map(normalizeApiOrder)
  // Guest tokens are deliberately never merged into an authenticated account.
  const guest = options.includeGuest !== false && !result.authenticated
    ? await Promise.all(Object.keys(tokens()).slice(-25).map((orderNumber) => fetchRemoteOrder(orderNumber)))
    : []
  const merged = [...authenticated, ...guest.filter((order): order is LocalOrder => Boolean(order))]
  return Array.from(new Map(merged.map((order) => [order.id, order])).values()).sort((a, b) => b.createdAt.localeCompare(a.createdAt))
}

export async function fetchRemoteOrder(orderNumber: string) {
  const token = tokens()[orderNumber]
  const response = await fetch(`/api/orders/${encodeURIComponent(orderNumber)}`, { headers: { Accept: "application/json", ...(token ? { "X-Order-Token": token } : {}) }, cache: "no-store" })
  if (!response.ok) return null
  const result = await response.json() as { order?: ApiOrder }
  return result.order ? normalizeApiOrder(result.order) : null
}
