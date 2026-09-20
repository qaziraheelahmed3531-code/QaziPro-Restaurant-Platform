import type { CoverageArea, LocationSource } from "@italian-pizza/shared/location"

export type OrderType = "delivery" | "pickup"

export type Coordinates = {
  latitude: number
  longitude: number
  accuracy?: number
  source?: LocationSource
}

export type DeliveryQuote = {
  distanceKm: number
  estimatedDurationMinutes: number
  deliveryFee: number
}

export type AreaGroupId = "ghazi-nearby" | "reservoir-side" | "extended-belt"

export type LocationArea = CoverageArea & {
  id: string
  databaseId?: string
  label: string
  aliases: string[]
  group: AreaGroupId
  additionalGroups?: AreaGroupId[]
}

export type SavedAddressLabel = "home" | "work" | "other"

export type SavedAddress = {
  id: string
  label: SavedAddressLabel
  city: string
  areaId: string
  addressLine1: string
  addressLine2: string
  landmark: string
  instructions: string
  coordinates?: Coordinates
}

export type HeroSlide = {
  id: string
  image: string
  mobileImage?: string
  alt: string
}

export type HeroSettings = {
  autoplay: boolean
  intervalMs: number
  transitionMs: 350 | 500 | 650
}

export type MenuSectionId = string

export type MenuSection = {
  id: MenuSectionId
  title: string
  description?: string
  descriptionBold?: boolean
  bannerImage?: string
  categoryImage: string
  productCategory?: string
  kind?: "products" | "deals"
}

export type ProductBadge = "Popular" | "20% OFF" | "Deal" | "New"

export type ProductOption = {
  id: string
  label: string
  priceDelta: number
  image?: string
  isDefault?: boolean
}

export type ProductModifierGroup = {
  id: string
  label: string
  selection: "single" | "multiple"
  required: boolean
  minSelections: number
  maxSelections: number | null
  options: ProductOption[]
}

export type ProductVariant = {
  id: string
  name: string
  priceDelta: number
  isDefault: boolean
}

export type Product = {
  id: string
  name: string
  description: string
  price: number
  oldPrice?: number
  category: string
  badge?: ProductBadge
  available: boolean
  customizable?: boolean
  image: string
  tags?: string[]
  modifierGroups?: ProductModifierGroup[]
  variants?: ProductVariant[]
}

export type Deal = {
  id: string
  name: string
  description: string
  price: number
  savings: number
  image: string
  available?: boolean
}

export type StorefrontBusiness = {
  id: string | null
  slug: string | null
  name: string
  displayName: string
  description: string
  footerDescription: string
  tagline: string
  contactText: string
  phone?: string | null
  email?: string | null
  address?: string | null
  city: string
  currency: "PKR"
  timezone: string
  logoUrl: string | null
  footerLogoUrl: string | null
  appStoreUrl?: string | null
  playStoreUrl?: string | null
  faviconUrl: string | null
  primaryColor: string
  secondaryColor: string
  websiteBackgroundColor: string
  headerBackgroundColor: string
  footerBackgroundColor: string
  productCardBackgroundColor: string
  textColor: string
  footerTextColor: string
  fontFamily: string
  fontStylesheetUrl: string | null
  headerLogoSizePx: number
  footerLogoSizePx: number
  announcementEnabled: boolean
  announcementText: string
  reviewsEnabled: boolean
  reviewsTitle: string
  reviewsBusinessName: string | null
  reviewsWidgetId: string | null
  whatsappFloatingEnabled: boolean
  whatsappNumber: string
  whatsappLogoUrl: string | null
  whatsappMessage: string
  whatsappSide: "LEFT" | "RIGHT"
  whatsappSizePx: number
  whatsappBottomPx: number
  whatsappSideOffsetPx: number
  socialLinks: Array<{ platform: string; url: string }>
  footerLinks: Array<{ label: string; href: string; group: string; isExternal: boolean }>
  contentPages: Array<{ slug: string; title: string; body: string }>
}

export type StorefrontBranch = {
  id: string | null
  name: string
  restaurantName?: string | null
  locationRevision?: number
  city: string
  countryCode?: string | null
  region?: string | null
  formattedAddress?: string | null
  timezone?: string
  temporarilyClosed: boolean
  isOpen: boolean
  pickupEnabled: boolean
  deliveryEnabled: boolean
  freeDistanceKm: number
  extraKmRate: number
  maximumDistanceKm?: number | null
  originLatitude: number | null
  originLongitude: number | null
  todayHoursLabel: string
}

export type StorefrontSnapshot = {
  source: "database" | "fallback"
  orderPersistence: "database" | "local-demo" | "unavailable"
  business: StorefrontBusiness
  branch: StorefrontBranch
  heroSlides: HeroSlide[]
  heroSettings: HeroSettings
  menuSections: MenuSection[]
  products: Product[]
  deals: Deal[]
  deliveryAreas: LocationArea[]
  availableBranches: Array<{ id: string; slug: string; name: string; city: string; formattedAddress: string | null }>
  resolutionError?: "TENANT_NOT_FOUND" | "BRANCH_REQUIRED" | "BRANCH_NOT_FOUND" | "CONFIGURATION_MISSING"
}

export type Branch = {
  id: string
  name: string
  area: string
  status: "open" | "closed"
  pickupLabel: string
}

export type CartLine = {
  lineId: string
  itemKind?: "product" | "deal"
  productId: string
  name: string
  unitPrice: number
  quantity: number
  options: string[]
  modifierSelections?: Array<{ groupId: string; optionId: string }>
  variantId?: string
  variantName?: string
  image: string
}

