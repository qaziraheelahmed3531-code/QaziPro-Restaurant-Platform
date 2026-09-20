import "server-only"

import { createHash } from "node:crypto"

import { locationSource } from "@italian-pizza/shared/location"
import { validateDeliveryPoint, validateRouteDistance } from "@/lib/location/validate-delivery"
import { getDrivingRoute } from "@/lib/geoapify/routing"
import { createAdminClient } from "@/lib/supabase/admin"
import { createClient as createSessionClient, isSupabaseConfigured } from "@/lib/supabase/server"
import { assertCustomerMutationAllowed } from "@/lib/restrictions/server"
import type { StorefrontSnapshot } from "@/types"
import { asQuantity, isUuid, normalizeText } from "@italian-pizza/shared/commerce"

type InputItem = { itemKind?: "product" | "deal"; productId: string; quantity: number; modifiers?: Array<{ groupId: string; optionId: string }> }
export type OrderInput = {
  branchId: string
  serviceMode: "DELIVERY" | "PICKUP"
  paymentMethod: "CASH_ON_DELIVERY"
  customerName: string
  customerPhone: string
  customerEmail?: string
  deliveryAreaId?: string
  deliveryAddress?: string
  deliveryInstructions?: string
  locationSource?: string
  latitude?: number
  longitude?: number
  promoCode?: string
  loyaltyCoinsToRedeem?: number
  items: InputItem[]
}

const orderSelect = "*,branches(name,city,address,formatted_address,latitude,longitude),order_items(*,order_item_modifiers(*)),order_status_history(*),rider_live_locations(latitude,longitude,accuracy_m,heading,is_active,recorded_at,updated_at)"

export async function currentUserId() {
  if (!isSupabaseConfigured()) return null
  try {
    const { data } = await (await createSessionClient()).auth.getUser()
    return data.user?.id ?? null
  } catch {
    return null
  }
}

async function currentCustomerIdentity() {
  if (!isSupabaseConfigured()) return { id: null, email: null }
  try {
    const { data } = await (await createSessionClient()).auth.getUser()
    return {
      id: data.user?.id ?? null,
      email: data.user?.email?.trim().toLowerCase() ?? null,
    }
  } catch {
    return { id: null, email: null }
  }
}

const boundedText = normalizeText

export async function createOrder(input: OrderInput, storefront: StorefrontSnapshot) {
  if (storefront.business.id) await assertCustomerMutationAllowed(storefront.business.id)
  if (storefront.source !== "database" || !storefront.branch.id || input.branchId !== storefront.branch.id) throw new Error("Ordering backend is not ready for this branch.")
  if (!isUuid(input.branchId)) throw new Error("Branch selection is invalid.")
  if (!Array.isArray(input.items) || input.items.length < 1 || input.items.length > 50) throw new Error("Your cart is empty or too large.")
  if (!boundedText(input.customerName, 120) || !boundedText(input.customerPhone, 40)) throw new Error("Name and phone are required.")
  const items = input.items.map((item) => {
    const quantity = asQuantity(item.quantity)
    if (!isUuid(item.productId) || quantity === null) throw new Error("A cart item is invalid.")
    const modifiers = Array.isArray(item.modifiers) ? item.modifiers.slice(0, 30).map((modifier) => {
      if (!isUuid(modifier.groupId) || !isUuid(modifier.optionId)) throw new Error("A customization selection is invalid.")
      return { groupId: modifier.groupId, optionId: modifier.optionId }
    }) : []
    return { itemKind: item.itemKind === "deal" ? "deal" as const : "product" as const, productId: item.productId, quantity, modifiers }
  })

  let distanceKm: number | undefined
  if (input.serviceMode === "DELIVERY") {
    if (!isUuid(input.deliveryAreaId) || !boundedText(input.deliveryAddress, 500)) throw new Error("Delivery area and address are required.")
    if (typeof input.latitude !== "number" || typeof input.longitude !== "number" || !Number.isFinite(input.latitude) || !Number.isFinite(input.longitude) || Math.abs(input.latitude) > 90 || Math.abs(input.longitude) > 180) throw new Error("Select an address suggestion or use current location so delivery can be calculated.")
    await validateDeliveryPoint({ latitude: input.latitude, longitude: input.longitude }, storefront, input.deliveryAreaId)
    const configuredOrigin = storefront.branch.originLatitude !== null && storefront.branch.originLongitude !== null
      ? { latitude: storefront.branch.originLatitude, longitude: storefront.branch.originLongitude }
      : undefined
    if (!configuredOrigin) throw new Error("Delivery location is being configured. Please try again shortly.")
    distanceKm = (await getDrivingRoute(Number(input.latitude), Number(input.longitude), configuredOrigin)).distanceKm
    validateRouteDistance(distanceKm, storefront)
  }

  const customer = await currentCustomerIdentity()
  const customerId = customer.id
  const loyaltyCoinsToRedeem = input.loyaltyCoinsToRedeem ?? 0
  if (!Number.isInteger(loyaltyCoinsToRedeem) || loyaltyCoinsToRedeem < 0 || loyaltyCoinsToRedeem > 1_000_000) throw new Error("Choose a valid number of loyalty coins.")
  const payload = {
    branchId: input.branchId,
    serviceMode: input.serviceMode,
    paymentMethod: "CASH_ON_DELIVERY",
    customerName: boundedText(input.customerName, 120),
    customerPhone: boundedText(input.customerPhone, 40),
    customerEmail: boundedText(customer.email ?? input.customerEmail, 254),
    deliveryAreaId: input.deliveryAreaId,
    deliveryAddress: boundedText(input.deliveryAddress, 500),
    deliveryInstructions: boundedText(input.deliveryInstructions, 500),
    locationSource: locationSource(input.locationSource),
    latitude: input.latitude,
    longitude: input.longitude,
    distanceKm,
    promoCode: boundedText(input.promoCode, 40),
    loyaltyCoinsToRedeem,
    items,
  }
  const { data, error } = await createAdminClient().rpc("create_order_with_loyalty", { p_payload: payload, p_customer_id: customerId })
  if (error) {
    if (process.env.NODE_ENV === "development") console.error("[order-create] transaction failed", { code: error.code })
    throw new Error(error.code === "22023" ? error.message : "We couldn't place the order right now. Please try again shortly.")
  }
  return data
}

export async function listCustomerOrders() {
  const customerId = await currentUserId()
  if (!customerId) return []
  const { data, error } = await createAdminClient().from("orders").select(orderSelect).eq("customer_id", customerId).order("created_at", { ascending: false }).limit(100)
  if (error) throw new Error(error.message)
  return data ?? []
}

export async function getAccessibleOrder(orderNumber: string, guestToken?: string | null) {
  const customerId = await currentUserId()
  let query = createAdminClient().from("orders").select(orderSelect).eq("order_number", orderNumber).limit(1)
  if (guestToken) query = query.eq("guest_tracking_hash", createHash("sha256").update(guestToken).digest("hex"))
  else if (customerId) query = query.eq("customer_id", customerId)
  else return null
  const { data, error } = await query.maybeSingle()
  if (error) throw new Error(error.message)
  if (!data) return null
  // Authorization hashes are server-internal, not customer tracking fields.
  const safeOrder = { ...data }
  delete safeOrder.guest_tracking_hash
  delete safeOrder.rider_id
  return safeOrder
}

export async function cancelAccessibleOrder(orderNumber: string, guestToken?: string | null) {
  const customerId = await currentUserId()
  const order = await getAccessibleOrder(orderNumber, guestToken)
  if (!order) return null
  const guestHash = guestToken ? createHash("sha256").update(guestToken).digest("hex") : null
  const { data, error } = await createAdminClient().rpc("cancel_customer_order", {
    p_order_id: order.id,
    p_customer_id: customerId,
    p_guest_tracking_hash: guestHash,
  })
  if (error) throw new Error(error.message)
  return data
}
