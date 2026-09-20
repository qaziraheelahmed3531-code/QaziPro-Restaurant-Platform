export const mobileApiVersion = "v1" as const
export const restaurantContextHeader = "x-qazipro-restaurant" as const
export const branchContextHeader = "x-qazipro-branch-id" as const

export type MobilePlatform = "android" | "ios"
export type PublicPaymentMethod = "CASH_ON_DELIVERY"

export type ApiMeta = {
  version: typeof mobileApiVersion
  requestId?: string
  nextCursor?: string | null
}

export type ApiSuccess<T> = { ok: true; data: T; meta: ApiMeta }
export type ApiFailure = {
  ok: false
  error: { code: string; message: string; details?: unknown }
  meta: ApiMeta
}
export type ApiEnvelope<T> = ApiSuccess<T> | ApiFailure

export type MobileRestaurantBootstrap = {
  restaurantKey: string
  name: string
  displayName: string
  logoUrl: string | null
  faviconUrl: string | null
  colors: { primary: string; secondary: string; background: string; text: string }
  currency: string
  timezone: string
  support: { phone: string | null; email: string | null; whatsapp: string | null }
  branches: Array<{
    id: string
    slug: string
    name: string
    city: string
    address: string | null
    isOpen: boolean
    temporarilyClosed: boolean
    orderingModes: Array<"PICKUP" | "DELIVERY">
    todayHoursLabel: string
  }>
  features: {
    favourites: boolean
    loyalty: boolean
    pushNotifications: boolean
    onlinePayments: boolean
  }
  paymentMethods: PublicPaymentMethod[]
  maintenance: { enabled: boolean; message: string | null }
  minimumVersions: { android: string | null; ios: string | null }
}

export type DeviceTokenInput = {
  deviceId: string
  platform: MobilePlatform
  pushToken: string
  appVersion?: string
  locale?: string
}
