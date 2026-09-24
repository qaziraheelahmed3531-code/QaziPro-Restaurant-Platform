import "server-only"

import { branchContextHeader, clientPlatformHeader, restaurantContextHeader, type MobileRestaurantBootstrap } from "@italian-pizza/shared/mobile-api"
import type { NextRequest } from "next/server"

import { ApiProblem } from "@/lib/api/v1"
import { getStorefrontSnapshot } from "@/lib/storefront/server"
import type { StorefrontSnapshot } from "@/types"
import { requireRuntimeEntitlements, runtimeEntitlements } from "@/lib/entitlements/server"

const slugPattern = /^[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?$/
const uuidPattern = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i

function headerOrQuery(request: NextRequest, header: string, query: string) {
  return request.headers.get(header)?.trim() || request.nextUrl.searchParams.get(query)?.trim() || ""
}

function assertNoInternalTenantIdentifier(request: NextRequest) {
  if (request.headers.has("x-qazipro-business-id") || request.nextUrl.searchParams.has("business_id") || request.nextUrl.searchParams.has("businessId")) {
    throw new ApiProblem("INTERNAL_TENANT_ID_FORBIDDEN", "Use the public restaurant key instead of an internal identifier.", 400)
  }
}

export function mobileRestaurantKey(request: NextRequest, required = false) {
  assertNoInternalTenantIdentifier(request)
  const value = headerOrQuery(request, restaurantContextHeader, "restaurant").toLowerCase()
  if (!value && required) throw new ApiProblem("RESTAURANT_REQUIRED", "A public restaurant key is required.", 400)
  if (value && !slugPattern.test(value)) throw new ApiProblem("INVALID_RESTAURANT", "The restaurant key is invalid.", 400)
  return value || null
}

export function mobileBranchKey(request: NextRequest, required = false) {
  const value = headerOrQuery(request, branchContextHeader, "branch")
  if (!value && required) throw new ApiProblem("BRANCH_REQUIRED", "Select a branch before continuing.", 409)
  if (value && !uuidPattern.test(value) && !slugPattern.test(value.toLowerCase())) throw new ApiProblem("INVALID_BRANCH", "The branch key is invalid.", 400)
  return value || null
}

function clientCapability(request: NextRequest) {
  const platform=request.headers.get(clientPlatformHeader)?.trim().toLowerCase()??""
  if(platform && platform!=="android" && platform!=="ios")throw new ApiProblem("INVALID_CLIENT_PLATFORM","The client platform is invalid.",400)
  return platform ? `mobile.${platform}` : "website.ordering"
}

function hostname(request: NextRequest) {
  return request.headers.get("x-forwarded-host") ?? request.headers.get("host")
}

function resolutionProblem(snapshot: StorefrontSnapshot): never {
  switch (snapshot.resolutionError) {
    case "TENANT_NOT_FOUND": throw new ApiProblem("RESTAURANT_NOT_FOUND", "The restaurant is unavailable.", 404)
    case "BRANCH_NOT_FOUND": throw new ApiProblem("BRANCH_NOT_FOUND", "The selected branch is unavailable for this restaurant.", 404,{availableBranches:snapshot.availableBranches})
    case "BRANCH_REQUIRED": throw new ApiProblem("BRANCH_REQUIRED", "Select a branch before continuing.", 409,{availableBranches:snapshot.availableBranches})
    case "CONFIGURATION_MISSING": throw new ApiProblem("SERVICE_UNAVAILABLE", "Restaurant configuration is unavailable.", 503)
  }
  throw new ApiProblem("STOREFRONT_UNAVAILABLE", "The storefront is unavailable.", 503)
}

export async function requireMobileStorefront(request: NextRequest, options: { branch?: boolean } = { branch:true }) {
  const restaurantKey = mobileRestaurantKey(request, false)
  // Resolve the restaurant before rejecting a missing branch so the client can
  // receive the authoritative, tenant-scoped branch choices in the error.
  const branchKey = mobileBranchKey(request, false)
  const snapshot = await getStorefrontSnapshot({
    hostname:restaurantKey ? "" : hostname(request),
    businessSlug:restaurantKey,
    branchId:branchKey,
  })
  if (restaurantKey && snapshot.business.slug && snapshot.business.slug !== restaurantKey) throw new ApiProblem("RESTAURANT_CONTEXT_MISMATCH", "The restaurant key does not match this storefront.", 409)
  const explicitDevelopmentDemo =
    process.env.NODE_ENV === "development" &&
    process.env.ENABLE_DEMO_STOREFRONT === "true" &&
    snapshot.source === "fallback" &&
    snapshot.orderPersistence === "local-demo"
  if (!snapshot.business.id || (options.branch && ((!explicitDevelopmentDemo && snapshot.source !== "database") || !snapshot.branch.id))) resolutionProblem(snapshot)
  if(snapshot.source==="database")await requireRuntimeEntitlements(snapshot.business.id,options.branch?snapshot.branch.id:null,[clientCapability(request)])
  return { restaurantKey, branchKey, snapshot }
}

export async function resolveMobileBootstrap(request: NextRequest): Promise<MobileRestaurantBootstrap> {
  const restaurantKey = mobileRestaurantKey(request, false)
  const initial = await getStorefrontSnapshot({
    hostname:restaurantKey ? "" : hostname(request),
    businessSlug:restaurantKey,
    // A sentinel prevents a browser branch cookie from silently selecting a branch.
    branchId:"00000000-0000-0000-0000-000000000000",
  })
  if (!initial.business.id || initial.resolutionError === "TENANT_NOT_FOUND" || initial.resolutionError === "CONFIGURATION_MISSING") resolutionProblem(initial)
  if (restaurantKey && initial.business.slug && initial.business.slug !== restaurantKey) throw new ApiProblem("RESTAURANT_CONTEXT_MISMATCH", "The restaurant key does not match this storefront.", 409)
  if (!initial.availableBranches.length) throw new ApiProblem("NO_ACTIVE_BRANCHES", "This restaurant has no active branches.", 503)
  const clientService=clientCapability(request)
  const services=await runtimeEntitlements(initial.business.id,null,[clientService,"ordering.pickup","ordering.delivery","loyalty"])
  if(!services[clientService]?.enabled)throw new ApiProblem("SERVICE_NOT_ENABLED","This service is not enabled for the restaurant.",403,{capability:clientService,reason:services[clientService]?.reason})
  const snapshots = await Promise.all(initial.availableBranches.map(branch => getStorefrontSnapshot({
    hostname:restaurantKey ? "" : hostname(request),businessSlug:restaurantKey,branchId:branch.id,
  })))
  const valid = snapshots.filter(snapshot => snapshot.business.id === initial.business.id && snapshot.branch.id)
  if (!valid.length) throw new ApiProblem("NO_ACTIVE_BRANCHES", "This restaurant has no available branches.", 503)
  const identity = valid[0]
  const publicKey = initial.business.slug || restaurantKey || request.nextUrl.hostname.toLowerCase()
  return {
    restaurantKey:publicKey,
    name:identity.business.name,
    displayName:identity.business.displayName,
    logoUrl:identity.business.logoUrl,
    faviconUrl:identity.business.faviconUrl,
    colors:{primary:identity.business.primaryColor,secondary:identity.business.secondaryColor,background:identity.business.websiteBackgroundColor,text:identity.business.textColor},
    currency:identity.business.currency,
    timezone:identity.business.timezone,
    support:{phone:identity.business.phone??null,email:identity.business.email??null,whatsapp:identity.business.whatsappNumber||null},
    branches:valid.map(snapshot => {
      const branch = initial.availableBranches.find(item => item.id === snapshot.branch.id)!
      const orderingModes: Array<"PICKUP"|"DELIVERY">=[]
      if(snapshot.branch.pickupEnabled&&services["ordering.pickup"]?.enabled)orderingModes.push("PICKUP")
      if(snapshot.branch.deliveryEnabled&&services["ordering.delivery"]?.enabled)orderingModes.push("DELIVERY")
      return {id:branch.id,slug:branch.slug,name:snapshot.branch.name,city:snapshot.branch.city,address:snapshot.branch.formattedAddress??branch.formattedAddress,isOpen:snapshot.branch.isOpen,temporarilyClosed:snapshot.branch.temporarilyClosed,orderingModes,todayHoursLabel:snapshot.branch.todayHoursLabel}
    }),
    features:{favourites:true,loyalty:Boolean(services.loyalty?.enabled),pushNotifications:true,onlinePayments:false},
    paymentMethods:["CASH_ON_DELIVERY"],
    maintenance:{enabled:process.env.MOBILE_MAINTENANCE_MODE === "true",message:process.env.MOBILE_MAINTENANCE_MESSAGE?.trim()||null},
    minimumVersions:{android:process.env.MOBILE_MIN_ANDROID_VERSION?.trim()||null,ios:process.env.MOBILE_MIN_IOS_VERSION?.trim()||null},
  }
}
