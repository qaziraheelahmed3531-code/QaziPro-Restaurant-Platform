"use server"

import { createHash, randomBytes, randomUUID } from "node:crypto"
import { deliverExternalInvitation, isSyntheticQaEmail, type InvitationDeliveryStatus } from "@italian-pizza/shared"
import { normalizeHostname, stagingHostnameForSlug } from "@italian-pizza/shared/domains"
import { revalidatePath } from "next/cache"
import { redirect } from "next/navigation"
import { requirePlatformPermission } from "@/lib/auth"
import { createClient } from "@/lib/supabase/server"
import { createPlatformAdminClient } from "@/lib/supabase/admin"
import { slugifyRestaurant, type RestaurantLifecycle } from "@/lib/platform"
import { appIdentifierPattern, supportedServiceKeys, validateProvisioningRequiredFields } from "@/lib/onboarding"
import { getPlatformAuthCallbackUrl } from "@/lib/public-origin"
import { mutationErrorMessage } from "@/lib/mutation-result"

export type ActionState = { error?: string; requestId?: string; success?: boolean; enabled?: boolean; updatedAt?: string }

const text = (form: FormData, name: string) => String(form.get(name) ?? "").trim()
const money = (form: FormData, name: string) => Math.max(0, Math.round(Number(form.get(name)) || 0))
const tokenHash = (value: string) => createHash("sha256").update(value).digest("hex")
const optionalNumber = (form: FormData, name: string) => {
  const value = text(form, name)
  return value === "" ? null : Number(value)
}
const safeReturnPath = (form: FormData, fallback: string) => {
  const value = text(form, "returnTo")
  return value.startsWith("/") && !value.startsWith("//") ? value : fallback
}

// Enhanced forms retain values and dialogs on expected business failures.
// Non-enhanced callers keep the existing navigation contract.
function mutationFailure(form: FormData, destination: string): ActionState {
  if (form.get("_inlineErrors") === "1") return { error: mutationErrorMessage(destination) }
  redirect(destination)
}

type PlatformAdminClient = NonNullable<ReturnType<typeof createPlatformAdminClient>>

async function deliverRestaurantOwnerInvitation(input: {
  admin: PlatformAdminClient
  businessId: string
  invitationId: string
  email: string
  currentStatus: InvitationDeliveryStatus
  allowManualResend?: boolean
}) {
  const allowed = input.allowManualResend
    ? new Set<InvitationDeliveryStatus>(["NOT_SENT", "FAILED", "SENT", "SUPPRESSED"])
    : new Set<InvitationDeliveryStatus>(["NOT_SENT"])
  const portalUrl = new URL(process.env.RESTAURANT_ADMIN_URL!)
  return deliverExternalInvitation({
    recipient: input.email,
    claim: async (deliveryStatus) => {
      if (!allowed.has(input.currentStatus)) return false
      const claim = await input.admin.from("staff_invitations")
        .update({ delivery_status: deliveryStatus, updated_at: new Date().toISOString() })
        .eq("id", input.invitationId)
        .eq("business_id", input.businessId)
        .eq("status", "PENDING")
        .eq("delivery_status", input.currentStatus)
        .select("id")
        .maybeSingle()
      return !claim.error && Boolean(claim.data)
    },
    send: async () => input.admin.auth.admin.inviteUserByEmail(input.email, {
      redirectTo: `${portalUrl.origin}/auth/callback`,
      data: { invited_business_id: input.businessId, invited_role: "OWNER" },
    }),
    complete: async (deliveryStatus) => {
      await input.admin.from("staff_invitations")
        .update({ delivery_status: deliveryStatus, updated_at: new Date().toISOString() })
        .eq("id", input.invitationId)
        .eq("business_id", input.businessId)
        .eq("delivery_status", "SENDING")
    },
  })
}

export async function provisionRestaurantAction(_: ActionState, form: FormData): Promise<ActionState> {
  await requirePlatformPermission("restaurants.create")
  await requirePlatformPermission("onboarding.manage")
  const requestId = randomUUID()
  const name = text(form, "name")
  const ownerName = text(form, "ownerName")
  const ownerEmail = text(form, "ownerEmail").toLowerCase()
  const city = text(form, "city")
  const packageId = text(form, "packageId")
  const slug = slugifyRestaurant(text(form, "slug") || name)
  const platformDomain = normalizeHostname(process.env.QAZIPRO_CUSTOMER_PLATFORM_DOMAIN || (process.env.APP_ENVIRONMENT === "staging" ? "staging.qazipro.com" : ""))
  const requestedCustomerDomain = text(form, "customerDomain")
  const customerDomain = normalizeHostname(requestedCustomerDomain) || stagingHostnameForSlug(slug, platformDomain)
  const branchNames = form.getAll("branchName").map(String).map((value) => value.trim())
  const branchCodes = form.getAll("branchCode").map(String).map((value) => value.trim())
  const branchCities = branchNames.map((_, index) => text(form, `branchCity${index}`))
  const branchCountryCodes = branchNames.map((_, index) => text(form, `branchCountryCode${index}`).toUpperCase())
  const branchAddresses = branchNames.map((_, index) => text(form, `branchAddress${index}`))
  const validationError = validateProvisioningRequiredFields({ name, ownerName, ownerEmail, city, packageId, branchNames, branchCodes, branchCities, branchCountryCodes, branchAddresses })
  if (validationError || !slug) return { error: validationError ?? "Enter a valid public restaurant key.", requestId }
  if (requestedCustomerDomain && !normalizeHostname(requestedCustomerDomain)) return { error: "Enter a valid customer hostname without a path or query string.", requestId }
  if (!customerDomain) return { error: "Configure a valid customer platform domain before provisioning.", requestId }
  const supabase = await createClient()
  const activePackage = await supabase.from("service_packages").select("id").eq("id", packageId).eq("is_active", true).maybeSingle()
  if (activePackage.error) return { error: "Service package validation is temporarily unavailable.", requestId }
  if (!activePackage.data) return { error: "Select an active service package before provisioning.", requestId }
  const services = form.getAll("services").map(String)
  if (services.some((service) => !supportedServiceKeys.has(service))) return { error: "One or more selected services are not supported.", requestId }
  const androidId = text(form, "androidId").toLowerCase()
  const iosId = text(form, "iosId").toLowerCase()
  if (services.includes("mobile.android") && !appIdentifierPattern.test(androidId)) return { error: "Enter a valid Android package ID such as com.qazipro.restaurant.", requestId }
  if (services.includes("mobile.ios") && !appIdentifierPattern.test(iosId)) return { error: "Enter a valid iOS bundle ID such as com.qazipro.restaurant.", requestId }
  const branches = branchNames.map((branchName, index) => {
    const latitude = optionalNumber(form, `branchLatitude${index}`)
    const longitude = optionalNumber(form, `branchLongitude${index}`)
    const hasOneCoordinate = latitude !== null || longitude !== null
    const hasValidCoordinates = latitude !== null && longitude !== null && Number.isFinite(latitude) && Number.isFinite(longitude) && Math.abs(latitude) <= 90 && Math.abs(longitude) <= 180 && (latitude !== 0 || longitude !== 0)
    if (hasOneCoordinate && !hasValidCoordinates) return null
    return {
      name: branchName,
      code: (branchCodes[index] || `B${index + 1}`).toUpperCase(),
      phone: text(form, `branchPhone${index}`),
      address: branchAddresses[index],
      city: branchCities[index],
      region: text(form, `branchRegion${index}`),
      countryCode: branchCountryCodes[index],
      countryName: text(form, `branchCountryName${index}`),
      postalCode: text(form, `branchPostalCode${index}`),
      latitude, longitude,
      locationProvider: hasValidCoordinates ? text(form, `branchLocationProvider${index}`) || "geoapify" : "",
      providerPlaceId: text(form, `branchProviderPlaceId${index}`),
      locationName: text(form, `branchLocationName${index}`),
      pickupEnabled: services.includes("ordering.pickup"),
      deliveryEnabled: false,
    }
  })
  if (branches.some((branch) => branch === null)) return { error: "Choose a complete valid location or clear both branch coordinates.", requestId }
  const payload = {
    name,
    slug,
    legalName: text(form, "legalName"),
    description: text(form, "description"),
    ownerName,
    ownerEmail,
    ownerPhone: text(form, "ownerPhone"),
    contactName: text(form, "contactName"),
    contactTitle: text(form, "contactTitle"),
    phone: text(form, "phone"),
    address: text(form, "address"),
    city,
    countryCode: text(form, "countryCode").toUpperCase() || "PK",
    currency: text(form, "currency").toUpperCase() || "PKR",
    timezone: text(form, "timezone") || "Asia/Karachi",
    primaryColor: text(form, "primaryColor") || "#a92114",
    secondaryColor: text(form, "secondaryColor") || "#e7a81a",
    logoUrl: text(form, "logoUrl"),
    packageId,
    baseFee: money(form, "baseFee"),
    setupFee: money(form, "setupFee"),
    billingFrequency: text(form, "billingFrequency") || "MONTHLY",
    commercialNotes: text(form, "commercialNotes"),
    services,
    branches,
    customerDomain,
    adminDomain: text(form, "adminDomain"),
    androidEnabled: services.includes("mobile.android"),
    androidName: text(form, "androidName") || name,
    androidId,
    iosEnabled: services.includes("mobile.ios"),
    iosName: text(form, "iosName") || name,
    iosId,
    reason: "Guided Super Admin onboarding",
  }
  const { data, error } = await supabase.rpc("platform_provision_restaurant", {
    p_request_key: text(form, "requestKey") || requestId,
    p_payload: payload,
  })
  if (error || !data) {
    const known: Record<string, string> = {
      "23505": "That restaurant key, domain, package ID or app identifier is already in use.",
      "42501": "Your QaziPro account does not have permission for this action.",
      "22023": "Review the onboarding values and branch configuration.",
    }
    return { error: known[error?.code ?? ""] ?? "Restaurant provisioning could not be completed safely.", requestId }
  }
  const admin = createPlatformAdminClient()
  if (admin && process.env.RESTAURANT_ADMIN_URL) {
    const invitation = await admin.from("staff_invitations").select("id,email,delivery_status").eq("business_id", data).eq("email", ownerEmail).eq("role", "OWNER").maybeSingle()
    if (invitation.data) {
      await deliverRestaurantOwnerInvitation({
        admin,
        businessId: String(data),
        invitationId: String(invitation.data.id),
        email: String(invitation.data.email),
        currentStatus: String(invitation.data.delivery_status) as InvitationDeliveryStatus,
      })
    }
  }
  revalidatePath("/")
  revalidatePath("/restaurants")
  redirect(`/restaurants/${data}?created=1`)
}

export async function createServicePackageAction(form: FormData) {
  await requirePlatformPermission("subscriptions.manage")
  const supabase = await createClient()
  const { error } = await supabase.rpc("platform_create_service_package", {
    p_payload: {
      code: text(form, "code").toUpperCase(), name: text(form, "name"), description: text(form, "description"),
      currency: text(form, "currency").toUpperCase() || "PKR", baseFee: money(form, "baseFee"), setupFee: money(form, "setupFee"),
      includedBranches: money(form, "includedBranches") || 1, additionalBranchFee: money(form, "additionalBranchFee"), terminalFee: money(form, "terminalFee"),
      billingFrequency: text(form, "billingFrequency") || "MONTHLY", capabilities: form.getAll("capabilities").map(String), reason: text(form, "reason") || "New package",
    },
  })
  revalidatePath("/packages")
  revalidatePath("/onboarding/new")
  if (error) return mutationFailure(form, "/packages?error=create")
  redirect("/packages?created=1")
}

export async function updateServicePackageAction(form: FormData) {
  await requirePlatformPermission("subscriptions.manage")
  const client = await createClient()
  const result = await client.rpc("platform_update_service_package", {
    p_package_id: text(form, "packageId"), p_expected_updated_at: text(form, "updatedAt") || null,
    p_payload: {
      name: text(form,"name"), description:text(form,"description"), currency:text(form,"currency").toUpperCase(),
      billingFrequency:text(form,"billingFrequency"), baseFee:Number(text(form,"baseFee")),
      setupFee:Number(text(form,"setupFee")), includedBranches:Number(text(form,"includedBranches")),
      additionalBranchFee:Number(text(form,"additionalBranchFee")), terminalFee:Number(text(form,"terminalFee")),
      reason:text(form,"reason"),
    },
  })
  if(result.error) return mutationFailure(form, `/packages?error=${result.error.code==="PT409"?"stale":"validation"}`)
  revalidatePath("/packages")
  revalidatePath("/onboarding/new")
  redirect("/packages?updated=1")
}

export async function setServicePackageStatusAction(form: FormData) {
  const context = await requirePlatformPermission("subscriptions.manage")
  const admin = createPlatformAdminClient()
  if (!admin) return mutationFailure(form, "/packages?error=configuration")
  const packageId = text(form, "packageId"), active = text(form, "active") === "true"
  const before = await admin.from("service_packages").select("id,name,is_active").eq("id", packageId).maybeSingle()
  if (!before.data) return mutationFailure(form, "/packages?error=missing")
  if (!active) {
    const inUse = await admin.from("restaurant_subscriptions").select("id", { count: "exact", head: true }).eq("package_id", packageId).in("status", ["TRIAL", "ACTIVE", "PAST_DUE", "GRACE_PERIOD"])
    if (inUse.error || Number(inUse.count) > 0) return mutationFailure(form, "/packages?error=in-use")
  }
  const updated = await admin.from("service_packages").update({ is_active: active, updated_at: new Date().toISOString() }).eq("id", packageId)
  if (updated.error) return mutationFailure(form, "/packages?error=status")
  await admin.from("platform_audit_logs").insert({ actor_user_id: context.userId, action: active ? "SERVICE_PACKAGE_ACTIVATED" : "SERVICE_PACKAGE_DEACTIVATED", target_type: "service_packages", target_id: packageId, reason: text(form, "reason") || "Service package lifecycle change", before_data: before.data, after_data: { is_active: active } })
  revalidatePath("/packages")
  revalidatePath("/onboarding/new")
  redirect("/packages?updated=1")
}

export async function addBranchAction(form: FormData) {
  await requirePlatformPermission("branches.manage")
  const businessId = text(form, "businessId")
  const returnTo = safeReturnPath(form, `/restaurants/${businessId}`)
  const supabase = await createClient()
  const { error } = await supabase.rpc("platform_add_branch", {
    p_business_id: businessId,
    p_payload: {
      name: text(form, "name"), code: text(form, "code"), phone: text(form, "phone"), address: text(form, "address"), city: text(form, "city"), region: text(form, "region"),
      countryCode: text(form, "countryCode").toUpperCase() || "PK", countryName: text(form, "countryName"), postalCode: text(form, "postalCode"), timezone: text(form, "timezone") || "Asia/Karachi",
      latitude: optionalNumber(form, "latitude"), longitude: optionalNumber(form, "longitude"), locationProvider: text(form, "locationProvider"), providerPlaceId: text(form, "providerPlaceId"), locationName: text(form, "locationName"),
      pickupEnabled: form.get("pickupEnabled") === "on", deliveryEnabled: form.get("deliveryEnabled") === "on", reason: text(form, "reason"),
    },
  })
  revalidatePath(`/restaurants/${businessId}`)
  revalidatePath("/branches")
  if (error) return mutationFailure(form, `${returnTo}?error=branch`)
  redirect(`${returnTo}?branch=created`)
}

export async function updateRestaurantAction(form: FormData) {
  const context = await requirePlatformPermission("restaurants.edit")
  const admin = createPlatformAdminClient()
  const businessId = text(form, "businessId")
  if (!admin) return mutationFailure(form, `/restaurants/${businessId}?error=configuration`)
  const scope = await verifyPlatformScope(admin, businessId, "")
  const name = text(form, "name"), ownerName = text(form, "ownerName"), ownerEmail = text(form, "ownerEmail").toLowerCase(), city = text(form, "city")
  if (!scope?.businessId || name.length < 2 || ownerName.length < 2 || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(ownerEmail) || !city) return mutationFailure(form, `/restaurants/${businessId}?error=validation`)
  const before = await admin.from("businesses").select("name,phone,email,address,city,currency,timezone").eq("id", businessId).maybeSingle()
  if (!before.data) return mutationFailure(form, `/restaurants/${businessId}?error=scope`)
  const businessValues = { name, phone: text(form, "phone") || null, email: ownerEmail, address: text(form, "address") || null, city, currency: text(form, "currency").toUpperCase() || "PKR", timezone: text(form, "timezone") || "Asia/Karachi", updated_at: new Date().toISOString() }
  const [businessUpdate, onboardingUpdate, brandingUpdate] = await Promise.all([
    admin.from("businesses").update(businessValues).eq("id", businessId),
    admin.from("restaurant_onboarding").update({ owner_name: ownerName, owner_email: ownerEmail, owner_phone: text(form, "ownerPhone") || null, commercial_notes: text(form, "commercialNotes"), updated_at: new Date().toISOString() }).eq("business_id", businessId),
    admin.from("business_branding").update({ display_name: text(form, "displayName") || name, updated_at: new Date().toISOString() }).eq("business_id", businessId),
  ])
  if (businessUpdate.error || onboardingUpdate.error || brandingUpdate.error) return mutationFailure(form, `/restaurants/${businessId}?error=save`)
  await admin.from("platform_audit_logs").insert({ actor_user_id: context.userId, action: "RESTAURANT_PROFILE_UPDATED", target_type: "businesses", target_id: businessId, business_id: businessId, reason: text(form, "reason") || "Restaurant profile update", before_data: before.data, after_data: businessValues })
  revalidatePath(`/restaurants/${businessId}`)
  revalidatePath("/restaurants")
  redirect(`/restaurants/${businessId}?profile=updated`)
}

export async function resendRestaurantOwnerInvitationAction(form: FormData) {
  const context = await requirePlatformPermission("restaurants.edit")
  const admin = createPlatformAdminClient()
  const businessId = text(form, "businessId")
  const invitationId = text(form, "invitationId")
  if (!admin || !process.env.RESTAURANT_ADMIN_URL) return mutationFailure(form, `/restaurants/${businessId}?error=invite-configuration`)
  const scope = await verifyPlatformScope(admin, businessId, "")
  if (!scope?.businessId) return mutationFailure(form, `/restaurants/${businessId}?error=scope`)
  const invitation = await admin.from("staff_invitations").select("id,email,role,status,is_active,delivery_status,expires_at,updated_at").eq("id", invitationId).eq("business_id", businessId).eq("role", "OWNER").maybeSingle()
  if (!invitation.data || !["PENDING","EXPIRED","REVOKED"].includes(String(invitation.data.status))) return mutationFailure(form, `/restaurants/${businessId}?error=invite-state`)
  let portalUrl: URL
  try { portalUrl = new URL(process.env.RESTAURANT_ADMIN_URL) } catch { return mutationFailure(form, `/restaurants/${businessId}?error=invite-configuration`) }
  if (!['http:', 'https:'].includes(portalUrl.protocol)) return mutationFailure(form, `/restaurants/${businessId}?error=invite-configuration`)
  if (invitation.data.delivery_status === "SENDING") return mutationFailure(form, `/restaurants/${businessId}?error=invite-in-progress`)
  const resetStatus: InvitationDeliveryStatus = "NOT_SENT"
  // Compare-and-swap prevents a second request from resetting an in-flight claim.
  const reset = await admin.from("staff_invitations").update({ status: "PENDING", is_active: true, revoked_at: null, expires_at: new Date(Date.now()+7*24*60*60*1000).toISOString(), delivery_status: resetStatus, updated_at: new Date().toISOString() }).eq("id", invitationId).eq("business_id", businessId).eq("status", invitation.data.status).eq("delivery_status", invitation.data.delivery_status).eq("updated_at", invitation.data.updated_at).select("id").maybeSingle()
  if (reset.error) return mutationFailure(form, `/restaurants/${businessId}?error=invite-update`)
  if (!reset.data) return mutationFailure(form, `/restaurants/${businessId}?error=invite-in-progress`)
  const result = await deliverRestaurantOwnerInvitation({
    admin,
    businessId,
    invitationId,
    email: String(invitation.data.email),
    currentStatus: resetStatus,
    allowManualResend: true,
  })
  if (!result.claimed) return mutationFailure(form, `/restaurants/${businessId}?error=invite-in-progress`)
  const deliveryStatus = result.status
  await admin.from("platform_audit_logs").insert({
    actor_user_id: context.userId,
    action: deliveryStatus === "FAILED" ? "RESTAURANT_OWNER_INVITATION_FAILED" : deliveryStatus === "SUPPRESSED" ? "RESTAURANT_OWNER_INVITATION_SUPPRESSED" : "RESTAURANT_OWNER_INVITATION_RESENT",
    target_type: "staff_invitations",
    target_id: invitationId,
    business_id: businessId,
    reason: text(form, "reason") || "Restaurant owner invitation resend",
    after_data: { email: invitation.data.email, role: invitation.data.role, delivery_status: deliveryStatus },
  })
  revalidatePath(`/restaurants/${businessId}`)
  if (deliveryStatus === "FAILED") return mutationFailure(form, `/restaurants/${businessId}?error=invite-delivery`)
  redirect(`/restaurants/${businessId}?invite=${deliveryStatus === "SUPPRESSED" ? "suppressed" : "sent"}`)
}

export async function setRestaurantOwnerInvitationStatusAction(form: FormData) {
  const context = await requirePlatformPermission("restaurants.edit")
  const admin = createPlatformAdminClient()
  const businessId = text(form, "businessId")
  const invitationId = text(form, "invitationId")
  if (!admin) return mutationFailure(form, `/restaurants/${businessId}?error=invite-configuration`)
  const scope = await verifyPlatformScope(admin, businessId, "")
  if (!scope?.businessId) return mutationFailure(form, `/restaurants/${businessId}?error=scope`)
  const invitation = await admin.from("staff_invitations").select("id,email,role,status,is_active").eq("id", invitationId).eq("business_id", businessId).eq("role", "OWNER").maybeSingle()
  if (!invitation.data || invitation.data.status !== "PENDING") return mutationFailure(form, `/restaurants/${businessId}?error=invite-state`)
  const updated = await admin.from("staff_invitations").update({ is_active: false, status: "REVOKED", revoked_at: new Date().toISOString(), updated_at: new Date().toISOString() }).eq("id", invitationId).eq("business_id", businessId).eq("status", "PENDING")
  if (updated.error) return mutationFailure(form, `/restaurants/${businessId}?error=invite-update`)
  await admin.from("platform_audit_logs").insert({
    actor_user_id: context.userId,
    action: "RESTAURANT_OWNER_INVITATION_REVOKED",
    target_type: "staff_invitations",
    target_id: invitationId,
    business_id: businessId,
    reason: text(form, "reason") || "Restaurant owner pending invitation access control",
    before_data: invitation.data,
    after_data: { is_active: false, status: "REVOKED" },
  })
  revalidatePath(`/restaurants/${businessId}`)
  redirect(`/restaurants/${businessId}?invite=updated`)
}

export async function updateRestaurantMembershipAction(form: FormData) {
  await requirePlatformPermission("restaurants.edit")
  const businessId = text(form, "businessId")
  const membershipId = text(form, "membershipId")
  const role = text(form, "role")
  const active = text(form, "active") === "true"
  const roles = ["OWNER","MANAGER","CASHIER","KITCHEN","WAITER","RIDER","STAFF"]
  if (!businessId || !membershipId || !roles.includes(role)) return mutationFailure(form, `/restaurants/${businessId}?error=membership-validation`)
  const supabase = await createClient()
  const { error } = await supabase.rpc("platform_update_restaurant_membership", {
    p_business_id: businessId,
    p_membership_id: membershipId,
    p_role: role,
    p_active: active,
    p_branch_ids: form.getAll("branchIds").map(String),
    p_reason: text(form, "reason") || "Restaurant 360 membership access update",
  })
  if (error) return mutationFailure(form, `/restaurants/${businessId}?error=${error.code === "22023" ? "membership-safety" : "membership-update"}`)
  revalidatePath(`/restaurants/${businessId}`)
  redirect(`/restaurants/${businessId}?membership=updated`)
}

export async function updateBranchAction(form: FormData) {
  const context = await requirePlatformPermission("branches.manage")
  const admin = createPlatformAdminClient()
  const businessId = text(form, "businessId"), branchId = text(form, "branchId")
  if (!admin) return mutationFailure(form, `/restaurants/${businessId}?error=configuration`)
  const scope = await verifyPlatformScope(admin, businessId, branchId)
  const name = text(form, "name"), code = text(form, "code").toUpperCase(), address = text(form, "address"), city = text(form, "city"), countryCode = text(form, "countryCode").toUpperCase()
  const latitude = optionalNumber(form, "latitude"), longitude = optionalNumber(form, "longitude")
  const hasCoordinates = latitude !== null || longitude !== null
  const coordinatesValid = latitude !== null && longitude !== null && Number.isFinite(latitude) && Number.isFinite(longitude) && Math.abs(latitude) <= 90 && Math.abs(longitude) <= 180 && (latitude !== 0 || longitude !== 0)
  if (!scope?.branchId || name.length < 2 || !code || !address || !city || !/^[A-Z]{2}$/.test(countryCode) || (hasCoordinates && !coordinatesValid)) return mutationFailure(form, `/restaurants/${businessId}?error=branch-validation`)
  const before = await admin.from("branches").select("*").eq("id", branchId).eq("business_id", businessId).maybeSingle()
  if (!before.data) return mutationFailure(form, `/restaurants/${businessId}?error=scope`)
  const deliveryRule = await admin.from("delivery_rules").select("branch_id").eq("branch_id", branchId).maybeSingle()
  const pickupEnabled = form.get("pickupEnabled") === "on"
  const deliveryEnabled = form.get("deliveryEnabled") === "on" && Boolean(deliveryRule.data) && coordinatesValid
  const values = {
    name, code, phone: text(form, "phone") || null, address, formatted_address: address, city, region: text(form, "region") || null,
    country_code: countryCode, country_name: text(form, "countryName") || null, postal_code: text(form, "postalCode") || null, timezone: text(form, "timezone") || "Asia/Karachi",
    latitude: coordinatesValid ? latitude : null, longitude: coordinatesValid ? longitude : null, location_provider: coordinatesValid ? text(form, "locationProvider") || "geoapify" : null,
    provider_place_id: coordinatesValid ? text(form, "providerPlaceId") || null : null, location_name: coordinatesValid ? text(form, "locationName") || null : null, location_locality: city,
    pickup_enabled: pickupEnabled, delivery_enabled: deliveryEnabled, online_ordering_enabled: pickupEnabled || deliveryEnabled ? Boolean(before.data.online_ordering_enabled) : false, updated_at: new Date().toISOString(),
  }
  const updated = await admin.from("branches").update(values).eq("id", branchId).eq("business_id", businessId)
  if (updated.error) return mutationFailure(form, `/restaurants/${businessId}?error=${updated.error.code === "23505" ? "branch-conflict" : "branch-save"}`)
  await admin.from("platform_audit_logs").insert({ actor_user_id: context.userId, action: "BRANCH_UPDATED", target_type: "branches", target_id: branchId, business_id: businessId, reason: text(form, "reason") || "Branch configuration update", before_data: before.data, after_data: { ...values, deliveryRequested: form.get("deliveryEnabled") === "on", deliveryEnabled } })
  revalidatePath(`/restaurants/${businessId}`)
  revalidatePath("/branches")
  redirect(`/restaurants/${businessId}?branch=updated${form.get("deliveryEnabled") === "on" && !deliveryEnabled ? "&delivery=pending" : ""}`)
}

export async function transitionRestaurantAction(form: FormData) {
  await requirePlatformPermission("restaurants.edit")
  const businessId = text(form, "businessId")
  const lifecycle = text(form, "lifecycle") as RestaurantLifecycle
  const reason = text(form, "reason")
  const supabase = await createClient()
  const { error } = await supabase.rpc("platform_transition_restaurant", {
    p_business_id: businessId,
    p_lifecycle: lifecycle,
    p_reason: reason,
  })
  if (error) return mutationFailure(form, `/restaurants/${businessId}?error=transition`)
  revalidatePath(`/restaurants/${businessId}`)
  revalidatePath("/restaurants")
  redirect(`/restaurants/${businessId}?updated=1`)
}

export async function createAgreementAction(form: FormData) {
  const context = await requirePlatformPermission("onboarding.manage")
  const onboardingId = text(form, "onboardingId")
  const version = text(form, "version")
  const legalText = text(form, "legalText")
  if (!onboardingId || version.length < 1 || legalText.length < 20) return mutationFailure(form, `/onboarding/${onboardingId}/agreement?error=validation`)
  const admin = createPlatformAdminClient()
  if (!admin) return mutationFailure(form, `/onboarding/${onboardingId}/agreement?error=configuration`)
  const { data: onboarding } = await admin.from("restaurant_onboarding").select("id,business_id,owner_name,owner_email,commercial_notes").eq("id", onboardingId).maybeSingle()
  if (!onboarding) return mutationFailure(form, "/onboarding?error=missing")
  const rawToken = randomBytes(32).toString("base64url")
  const expiresAt = new Date(Date.now() + 7 * 24 * 60 * 60 * 1000).toISOString()
  const { data: document, error } = await admin.from("onboarding_documents").insert({
    onboarding_id: onboardingId,
    document_type: "AGREEMENT",
    version,
    status: "SENT",
    legal_text: legalText,
    share_token_hash: tokenHash(rawToken),
    share_expires_at: expiresAt,
    document_data: {
      clientName: onboarding.owner_name,
      clientEmail: onboarding.owner_email,
      packageName: text(form, "packageName"),
      monthlyCharge: money(form, "monthlyCharge"),
      setupCharge: money(form, "setupCharge"),
      branchCharge: money(form, "branchCharge"),
      appCharge: money(form, "appCharge"),
      taxesAndExclusions: text(form, "taxesAndExclusions"),
      commercialNotes: text(form, "commercialNotes") || onboarding.commercial_notes,
      assignedPoc: text(form, "assignedPoc"),
    },
    created_by: context.userId,
  }).select("id").single()
  if (error || !document) return mutationFailure(form, `/onboarding/${onboardingId}/agreement?error=create`)
  await admin.from("platform_audit_logs").insert({
    actor_user_id: context.userId,
    action: "ONBOARDING_AGREEMENT_SENT",
    target_type: "onboarding_documents",
    target_id: document.id,
    business_id: onboarding.business_id,
    reason: text(form, "reason") || "Client agreement generated",
    after_data: { version, expiresAt },
  })
  revalidatePath(`/onboarding/${onboardingId}/agreement`)
  redirect(`/onboarding/${onboardingId}/agreement?created=1&share=${encodeURIComponent(rawToken)}`)
}

export async function signAgreementAction(_: ActionState, form: FormData): Promise<ActionState> {
  const requestId = randomUUID()
  const rawToken = text(form, "token")
  const signerName = text(form, "signerName")
  const signerEmail = text(form, "signerEmail").toLowerCase()
  const accepted = form.get("accepted") === "on"
  if (rawToken.length < 32 || signerName.length < 2 || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(signerEmail) || !accepted) {
    return { error: "Complete the signer details and accept the approved terms.", requestId }
  }
  const admin = createPlatformAdminClient()
  if (!admin) return { error: "Agreement service is temporarily unavailable.", requestId }
  const { data: allowed } = await admin.rpc("consume_api_rate_limit", { p_key_hash: tokenHash(`agreement:${rawToken}`), p_limit: 8, p_window_seconds: 900 })
  if (allowed !== true) return { error: "Too many signing attempts. Wait before trying again.", requestId }
  const { data: document } = await admin.from("onboarding_documents")
    .select("id,onboarding_id,status,share_expires_at,document_data,restaurant_onboarding(business_id,owner_email)")
    .eq("share_token_hash", tokenHash(rawToken)).maybeSingle()
  const expectedEmail = String((document?.document_data as Record<string, unknown> | null)?.clientEmail ?? "").toLowerCase()
  if (!document || !["SENT", "CLIENT_REVIEW", "CORRECTION_REQUESTED"].includes(String(document.status)) || !document.share_expires_at || Date.parse(document.share_expires_at) <= Date.now() || expectedEmail !== signerEmail) {
    return { error: "This secure agreement link is invalid, expired or does not match the invited contact.", requestId }
  }
  const signedAt = new Date().toISOString()
  const { data: signedDocument, error } = await admin.from("onboarding_documents").update({ signer_name: signerName, signer_email: signerEmail, signed_at: signedAt, status: "SIGNED", updated_at: signedAt, share_token_hash: null }).eq("id", document.id).eq("share_token_hash", tokenHash(rawToken)).eq("status", document.status).select("id").maybeSingle()
  if (error || !signedDocument) return { error: "Agreement submission could not be completed safely.", requestId }
  const relation = document.restaurant_onboarding as unknown as { business_id?: string } | null
  await admin.from("platform_audit_logs").insert({ action: "ONBOARDING_AGREEMENT_SIGNED", target_type: "onboarding_documents", target_id: document.id, business_id: relation?.business_id ?? null, reason: "Client submitted signed onboarding agreement", request_id: requestId, after_data: { signedAt, signerEmail } })
  return { requestId }
}

export async function approveAgreementAction(form: FormData) {
  const context = await requirePlatformPermission("onboarding.manage")
  const documentId = text(form, "documentId")
  const onboardingId = text(form, "onboardingId")
  const admin = createPlatformAdminClient()
  if (!admin) return mutationFailure(form, `/onboarding/${onboardingId}/agreement?error=configuration`)
  const now = new Date().toISOString()
  const { data: document, error } = await admin.from("onboarding_documents").update({ status: "APPROVED", approved_by: context.userId, approved_at: now, updated_at: now }).eq("id", documentId).eq("status", "SIGNED").select("id,onboarding_id,restaurant_onboarding(business_id)").maybeSingle()
  if (error || !document) return mutationFailure(form, `/onboarding/${onboardingId}/agreement?error=approve`)
  const relation = document.restaurant_onboarding as unknown as { business_id?: string } | null
  await admin.from("platform_audit_logs").insert({ actor_user_id: context.userId, action: "ONBOARDING_AGREEMENT_APPROVED", target_type: "onboarding_documents", target_id: documentId, business_id: relation?.business_id ?? null, reason: text(form, "reason") || "Signed client agreement approved" })
  revalidatePath(`/onboarding/${onboardingId}/agreement`)
  redirect(`/onboarding/${onboardingId}/agreement?approved=1`)
}

export async function invitePlatformStaffAction(form: FormData) {
  const context = await requirePlatformPermission("team.manage")
  const email = text(form, "email").toLowerCase()
  const displayName = text(form, "displayName")
  const roleKey = text(form, "roleKey")
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email) || displayName.length < 2) return mutationFailure(form, "/team?error=validation")
  const admin = createPlatformAdminClient()
  if (!admin) return mutationFailure(form, "/team?error=configuration")
  const { data: role } = await admin.from("platform_roles").select("id,key").eq("key", roleKey).maybeSingle()
  if (!role || role.key === "PLATFORM_OWNER") return mutationFailure(form, "/team?error=role")
  const redirectTo = getPlatformAuthCallbackUrl()
  const invited = isSyntheticQaEmail(email)
    ? await admin.auth.admin.generateLink({ type: "invite", email, options: { redirectTo, data: { full_name: displayName, qazipro_platform_invite: true } } })
    : await admin.auth.admin.inviteUserByEmail(email, { redirectTo, data: { full_name: displayName, qazipro_platform_invite: true } })
  if (invited.error || !invited.data.user) return mutationFailure(form, "/team?error=invite")
  await admin.from("platform_staff").upsert({ user_id: invited.data.user.id, display_name: displayName, email, status: "INVITED", mfa_required: form.get("mfaRequired") === "on", updated_at: new Date().toISOString() }, { onConflict: "user_id" })
  await admin.from("platform_staff_roles").upsert({ staff_user_id: invited.data.user.id, role_id: role.id, assigned_by: context.userId }, { onConflict: "staff_user_id,role_id" })
  await admin.from("platform_audit_logs").insert({ actor_user_id: context.userId, action: "PLATFORM_STAFF_INVITED", target_type: "platform_staff", target_id: invited.data.user.id, reason: text(form, "reason") || "QaziPro team invitation", after_data: { email, role: roleKey } })
  revalidatePath("/team")
  redirect("/team?invited=1")
}

export async function revokePlatformStaffAction(form: FormData) {
  const context = await requirePlatformPermission("team.manage")
  const userId = text(form, "userId")
  if (!userId || userId === context.userId) return mutationFailure(form, "/team?error=self")
  const admin = createPlatformAdminClient()
  if (!admin) return mutationFailure(form, "/team?error=configuration")
  const now = new Date().toISOString()
  const { error } = await admin.from("platform_staff").update({ status: "REVOKED", access_revoked_at: now, updated_at: now }).eq("user_id", userId)
  if (error) return mutationFailure(form, "/team?error=revoke")
  await admin.from("platform_audit_logs").insert({ actor_user_id: context.userId, action: "PLATFORM_STAFF_REVOKED", target_type: "platform_staff", target_id: userId, reason: text(form, "reason") || "Platform access revoked" })
  revalidatePath("/team")
  redirect("/team?revoked=1")
}

export async function setStaffPermissionAction(form: FormData) {
  const context = await requirePlatformPermission("team.manage")
  const admin = createPlatformAdminClient()
  if (!admin) return mutationFailure(form, "/team?error=configuration")
  const actorRole = await admin.from("platform_staff_roles").select("platform_roles(key)").eq("staff_user_id", context.userId)
  const owner = (actorRole.data ?? []).some((row) => {
    const relation = row.platform_roles as { key?: string } | { key?: string }[] | null
    return Array.isArray(relation) ? relation.some((item) => item.key === "PLATFORM_OWNER") : relation?.key === "PLATFORM_OWNER"
  })
  if (!owner) return mutationFailure(form, "/team?error=owner-only")
  const userId = text(form, "userId"), permission = text(form, "permission"), mode = text(form, "mode")
  const [staff, permissionRow, targetRoles] = await Promise.all([
    admin.from("platform_staff").select("user_id,status").eq("user_id", userId).maybeSingle(),
    admin.from("platform_permissions").select("key").eq("key", permission).maybeSingle(),
    admin.from("platform_staff_roles").select("platform_roles(key)").eq("staff_user_id", userId),
  ])
  const targetIsOwner = (targetRoles.data ?? []).some((row) => {
    const relation = row.platform_roles as { key?: string } | { key?: string }[] | null
    return Array.isArray(relation) ? relation.some((item) => item.key === "PLATFORM_OWNER") : relation?.key === "PLATFORM_OWNER"
  })
  if (!staff.data || staff.data.status === "REVOKED" || !permissionRow.data || !["ALLOW", "DENY", "INHERIT"].includes(mode) || userId === context.userId || targetIsOwner) return mutationFailure(form, "/team?error=validation")
  const prior = await admin.from("platform_staff_permissions").select("permission_key,allowed").eq("staff_user_id", userId).eq("permission_key", permission).maybeSingle()
  const changed = mode === "INHERIT"
    ? await admin.from("platform_staff_permissions").delete().eq("staff_user_id", userId).eq("permission_key", permission)
    : await admin.from("platform_staff_permissions").upsert({ staff_user_id: userId, permission_key: permission, allowed: mode === "ALLOW", assigned_by: context.userId, assigned_at: new Date().toISOString() }, { onConflict: "staff_user_id,permission_key" })
  if (changed.error) return mutationFailure(form, "/team?error=permission")
  await admin.from("platform_audit_logs").insert({ actor_user_id: context.userId, action: "PLATFORM_STAFF_PERMISSION_CHANGED", target_type: "platform_staff_permissions", target_id: userId, reason: text(form, "reason") || "Approved custom permission change", before_data: prior.data, after_data: { permission, mode } })
  revalidatePath("/team")
  redirect("/team?permission=1")
}

async function verifyPlatformScope(admin: NonNullable<ReturnType<typeof createPlatformAdminClient>>, businessId: string, branchId: string) {
  if (!businessId) return { businessId: null, branchId: null }
  const business = await admin.from("businesses").select("id").eq("id", businessId).maybeSingle()
  if (!business.data) return null
  if (!branchId) return { businessId, branchId: null }
  const branch = await admin.from("branches").select("id").eq("id", branchId).eq("business_id", businessId).maybeSingle()
  return branch.data ? { businessId, branchId } : null
}

export async function createIncidentAction(form: FormData) {
  const context = await requirePlatformPermission("incidents.manage")
  const admin = createPlatformAdminClient()
  if (!admin) return mutationFailure(form, "/health?error=configuration")
  const businessId = text(form, "businessId"), branchId = text(form, "branchId")
  const scope = await verifyPlatformScope(admin, businessId, branchId)
  const severity = text(form, "severity"), environment = text(form, "environment"), title = text(form, "title"), component = text(form, "component"), summary = text(form, "summary")
  if (!scope || !["INFO", "WARNING", "CRITICAL"].includes(severity) || !["LOCAL", "STAGING", "PRODUCTION"].includes(environment) || title.length < 3 || component.length < 2 || summary.length < 5) return mutationFailure(form, "/health?error=validation")
  const { data, error } = await admin.from("platform_incidents").insert({ business_id: scope.businessId, branch_id: scope.branchId, severity, health_state: severity === "CRITICAL" ? "CRITICAL" : severity === "WARNING" ? "WARNING" : "UNKNOWN", environment, component, title, summary, technical_details: text(form, "technicalDetails") || null, request_id: text(form, "requestId") || null, status: "OPEN", assigned_staff_user_id: context.userId }).select("id").single()
  if (error || !data) return mutationFailure(form, "/health?error=create")
  await admin.from("platform_audit_logs").insert({ actor_user_id: context.userId, action: "PLATFORM_INCIDENT_OPENED", target_type: "platform_incidents", target_id: data.id, business_id: scope.businessId, reason: text(form, "reason") || "Operational incident opened", after_data: { severity, environment, component } })
  revalidatePath("/health")
  redirect("/health?created=1")
}

export async function createSupportTicketAction(form: FormData) {
  const context = await requirePlatformPermission("support.access")
  const admin = createPlatformAdminClient()
  if (!admin) return mutationFailure(form, "/support?error=configuration")
  const businessId = text(form, "businessId"), branchId = text(form, "branchId")
  const scope = await verifyPlatformScope(admin, businessId, branchId)
  const severity = text(form, "severity"), subject = text(form, "subject"), description = text(form, "description")
  if (!scope?.businessId || !["LOW", "NORMAL", "HIGH", "CRITICAL"].includes(severity) || subject.length < 3 || description.length < 5) return mutationFailure(form, "/support?error=validation")
  const { data, error } = await admin.from("support_tickets").insert({ business_id: scope.businessId, branch_id: scope.branchId, category: text(form, "category") || "GENERAL", severity, subject, description, status: "OPEN", assigned_staff_user_id: context.userId, created_by: context.userId }).select("id,ticket_number").single()
  if (error || !data) return mutationFailure(form, "/support?error=create")
  await admin.from("platform_audit_logs").insert({ actor_user_id: context.userId, action: "SUPPORT_TICKET_OPENED", target_type: "support_tickets", target_id: data.id, business_id: scope.businessId, reason: text(form, "reason") || "Client support request opened", after_data: { ticketNumber: data.ticket_number, severity } })
  revalidatePath("/support")
  redirect("/support?created=1")
}

export async function recordDeploymentAction(form: FormData) {
  const context = await requirePlatformPermission("deployments.manage")
  const admin = createPlatformAdminClient()
  if (!admin) return mutationFailure(form, "/deployments?error=configuration")
  const businessId = text(form, "businessId"), component = text(form, "component"), environment = text(form, "environment"), status = text(form, "status")
  const scope = await verifyPlatformScope(admin, businessId, "")
  const components = ["CUSTOMER_WEBSITE", "RESTAURANT_ADMIN", "BACKEND_API", "DESKTOP_POS", "ANDROID", "IOS", "SUPER_ADMIN"]
  if (!scope || !components.includes(component) || !["LOCAL", "STAGING", "PRODUCTION"].includes(environment) || !["QUEUED", "BUILDING", "READY", "FAILED", "CANCELLED", "ROLLED_BACK"].includes(status)) return mutationFailure(form, "/deployments?error=validation")
  const { data, error } = await admin.from("deployment_records").insert({ business_id: scope.businessId, component, environment, version: text(form, "version") || null, commit_sha: text(form, "commitSha") || null, provider: text(form, "provider") || null, provider_reference: text(form, "providerReference") || null, status, initiated_by: context.userId, started_at: new Date().toISOString(), finished_at: ["READY", "FAILED", "CANCELLED", "ROLLED_BACK"].includes(status) ? new Date().toISOString() : null, error_summary: status === "FAILED" ? text(form, "errorSummary") || "Failure details pending" : null }).select("id").single()
  if (error || !data) return mutationFailure(form, "/deployments?error=create")
  await admin.from("platform_audit_logs").insert({ actor_user_id: context.userId, action: "DEPLOYMENT_RECORDED", target_type: "deployment_records", target_id: data.id, business_id: scope.businessId, reason: text(form, "reason") || "Deployment evidence recorded", after_data: { component, environment, status } })
  revalidatePath("/deployments")
  redirect("/deployments?created=1")
}

export async function setBranchStatusAction(form: FormData) {
  const context = await requirePlatformPermission("branches.manage")
  const admin = createPlatformAdminClient()
  const businessId = text(form, "businessId"), branchId = text(form, "branchId")
  const returnTo = safeReturnPath(form, "/branches")
  if (!admin) return mutationFailure(form, `${returnTo}?error=configuration`)
  const scope = await verifyPlatformScope(admin, businessId, branchId)
  const active = text(form, "active") === "true"
  const { data: before } = scope?.branchId
    ? await admin.from("branches").select("id,is_active,online_ordering_enabled").eq("id", scope.branchId).eq("business_id", businessId).maybeSingle()
    : { data: null }
  if (!scope?.branchId || !before) return mutationFailure(form, `${returnTo}?error=scope`)
  if (!active) {
    const remaining = await admin.from("branches").select("id", { count: "exact", head: true }).eq("business_id", businessId).eq("is_active", true).neq("id", branchId)
    if (remaining.error || !remaining.count) return mutationFailure(form, `${returnTo}?error=last-active`)
  }
  const patch = active ? { is_active: true } : { is_active: false, online_ordering_enabled: false }
  const { error } = await admin.from("branches").update(patch).eq("id", branchId).eq("business_id", businessId)
  if (error) return mutationFailure(form, `${returnTo}?error=update`)
  await admin.from("platform_audit_logs").insert({ actor_user_id: context.userId, action: active ? "BRANCH_ACTIVATED" : "BRANCH_DEACTIVATED", target_type: "branches", target_id: branchId, business_id: businessId, reason: text(form, "reason") || "Platform branch status change", before_data: before, after_data: patch })
  revalidatePath("/branches")
  revalidatePath(`/restaurants/${businessId}`)
  redirect(`${returnTo}?branchStatus=updated`)
}

export async function upsertDomainAction(form: FormData) {
  const context = await requirePlatformPermission("domains.manage")
  const supabase = await createClient()
  const businessId = text(form, "businessId"), purpose = text(form, "purpose")
  const hostname = normalizeHostname(text(form, "hostname"))
  if (!businessId || !hostname || !["CUSTOMER", "ADMIN", "APP_LINKS", "OTHER"].includes(purpose)) return mutationFailure(form, "/domains?error=validation")
  const result = await supabase.rpc("platform_manage_domain", {
    p_business_id: businessId,
    p_action: "ADD",
    p_domain_id: null,
    p_hostname: hostname,
    p_purpose: purpose,
    p_reason: text(form, "reason") || `Domain added by ${context.email}`,
  })
  if (result.error || !result.data) return mutationFailure(form, `/domains?error=${result.error?.code === "23505" ? "conflict" : "save"}`)
  revalidatePath("/domains")
  revalidatePath(`/restaurants/${businessId}`)
  redirect("/domains?saved=1")
}

export async function manageDomainAction(form: FormData) {
  await requirePlatformPermission("domains.manage")
  const supabase = await createClient()
  const businessId = text(form, "businessId")
  const domainId = text(form, "domainId")
  const action = text(form, "domainAction").toUpperCase()
  const hostname = action === "EDIT_PENDING" ? normalizeHostname(text(form, "hostname")) : ""
  if (!businessId || !domainId || !["EDIT_PENDING", "SET_PRIMARY", "DEACTIVATE"].includes(action) || (action === "EDIT_PENDING" && !hostname)) return mutationFailure(form, "/domains?error=validation")
  const result = await supabase.rpc("platform_manage_domain", {
    p_business_id: businessId,
    p_action: action,
    p_domain_id: domainId,
    p_hostname: hostname || null,
    p_purpose: "CUSTOMER",
    p_reason: text(form, "reason") || "Domain registry action",
  })
  if (result.error || !result.data) return mutationFailure(form, `/domains?error=${result.error?.code === "23505" ? "conflict" : "action"}`)
  revalidatePath("/domains")
  revalidatePath(`/restaurants/${businessId}`)
  redirect("/domains?saved=1")
}

export async function upsertMobileAppAction(form: FormData) {
  const context = await requirePlatformPermission("apps.manage")
  const admin = createPlatformAdminClient()
  if (!admin) return mutationFailure(form, "/apps?error=configuration")
  const businessId = text(form, "businessId"), platform = text(form, "platform"), applicationIdentifier = text(form, "applicationIdentifier").toLowerCase()
  const enabled = form.get("enabled") === "on"
  const scope = await verifyPlatformScope(admin, businessId, "")
  const business = scope?.businessId ? await admin.from("businesses").select("slug").eq("id", businessId).single() : { data: null }
  if (!scope?.businessId || !business.data?.slug || !["ANDROID", "IOS"].includes(platform) || (enabled && (!/^[a-z][a-z0-9]*(\.[a-z][a-z0-9]*){2,}$/.test(applicationIdentifier) || text(form, "appName").length < 2)) || !["MISSING", "INVALID", "NEEDS_REVIEW", "DISABLED"].includes(text(form, "credentialStatus") || "MISSING") || !["CONFIGURATION", "CREDENTIALS_REQUIRED", "FAILED", "UPDATE_REQUIRED"].includes(text(form, "releaseStatus") || "CONFIGURATION")) return mutationFailure(form, "/apps?error=validation")
  const existing = await admin.from("mobile_app_records").select("id,business_id,platform,application_identifier,release_status").eq("business_id", businessId).eq("platform", platform).maybeSingle()
  const values = { business_id: businessId, platform, enabled, app_name: text(form, "appName") || null, application_identifier: applicationIdentifier || null, restaurant_public_key: business.data.slug, version_name: text(form, "versionName") || null, build_number: money(form, "buildNumber") || null, credential_status: text(form, "credentialStatus") || "MISSING", release_status: enabled ? text(form, "releaseStatus") || "CONFIGURATION" : "NOT_PURCHASED", store_url: text(form, "storeUrl") || null, updated_at: new Date().toISOString() }
  const result = existing.data
    ? await admin.from("mobile_app_records").update(values).eq("id", existing.data.id).select("id").single()
    : await admin.from("mobile_app_records").insert(values).select("id").single()
  if (result.error || !result.data) return mutationFailure(form, `/apps?error=${result.error?.code === "23505" ? "conflict" : "save"}`)
  await admin.from("platform_audit_logs").insert({ actor_user_id: context.userId, action: "MOBILE_APP_CONFIGURATION_SAVED", target_type: "mobile_app_records", target_id: result.data.id, business_id: businessId, reason: text(form, "reason") || "Mobile app registry update", before_data: existing.data, after_data: { platform, enabled, applicationIdentifier, releaseStatus: values.release_status } })
  revalidatePath("/apps")
  revalidatePath(`/restaurants/${businessId}`)
  redirect("/apps?saved=1")
}

export async function updateSubscriptionAction(form: FormData) {
  const context = await requirePlatformPermission("billing.edit")
  const admin = createPlatformAdminClient()
  if (!admin) return mutationFailure(form, "/billing?error=configuration")
  const businessId = text(form, "businessId"), packageId = text(form, "packageId"), status = text(form, "status")
  const scope = await verifyPlatformScope(admin, businessId, "")
  const packageResult = packageId ? await admin.from("service_packages").select("id").eq("id", packageId).eq("is_active", true).maybeSingle() : { data: null }
  if (!scope?.businessId || (packageId && !packageResult.data) || !["TRIAL", "ACTIVE", "PAST_DUE", "GRACE_PERIOD", "SUSPENDED", "CANCELLED"].includes(status)) return mutationFailure(form, "/billing?error=validation")
  const before = await admin.from("restaurant_subscriptions").select("*").eq("business_id", businessId).maybeSingle()
  const values = { business_id: businessId, package_id: packageId || null, status, currency: text(form, "currency").toUpperCase() || "PKR", base_fee: money(form, "baseFee"), setup_fee: money(form, "setupFee"), branch_fee: money(form, "branchFee"), terminal_fee: money(form, "terminalFee"), android_fee: money(form, "androidFee"), ios_fee: money(form, "iosFee"), discount: money(form, "discount"), tax: money(form, "tax"), billing_frequency: text(form, "billingFrequency") || "MONTHLY", next_invoice_date: text(form, "nextInvoiceDate") || null, notes: text(form, "notes"), updated_at: new Date().toISOString() }
  const result = await admin.from("restaurant_subscriptions").upsert(values, { onConflict: "business_id" }).select("id").single()
  if (result.error || !result.data) return mutationFailure(form, "/billing?error=save")
  await admin.from("platform_audit_logs").insert({ actor_user_id: context.userId, action: "SUBSCRIPTION_UPDATED", target_type: "restaurant_subscriptions", target_id: result.data.id, business_id: businessId, reason: text(form, "reason") || "Commercial record updated", before_data: before.data, after_data: values })
  revalidatePath("/billing")
  revalidatePath(`/restaurants/${businessId}`)
  redirect("/billing?saved=1")
}

export async function setEntitlementAction(form: FormData) {
  const context = await requirePlatformPermission("subscriptions.manage")
  const admin = createPlatformAdminClient()
  const returnTo = safeReturnPath(form, "/billing")
  if (!admin) return mutationFailure(form, `${returnTo}?error=configuration`)
  const businessId = text(form, "businessId"), capability = text(form, "capability").toLowerCase()
  const scope = await verifyPlatformScope(admin, businessId, "")
  if (!scope?.businessId || !supportedServiceKeys.has(capability)) return mutationFailure(form, `${returnTo}?error=entitlement`)
  const values = { business_id: businessId, capability_key: capability, source: "OVERRIDE", enabled: text(form, "enabled") === "true", effective_until: text(form, "effectiveUntil") || null, notes: text(form, "notes"), updated_at: new Date().toISOString() }
  const result = await admin.from("service_entitlements").upsert(values, { onConflict: "business_id,capability_key,source" }).select("id").single()
  if (result.error || !result.data) return mutationFailure(form, `${returnTo}?error=entitlement-save`)
  await admin.from("platform_audit_logs").insert({ actor_user_id: context.userId, action: "ENTITLEMENT_OVERRIDE_SAVED", target_type: "service_entitlements", target_id: result.data.id, business_id: businessId, reason: text(form, "reason") || "Restaurant capability override", after_data: values })
  revalidatePath("/billing")
  revalidatePath(`/restaurants/${businessId}`)
  redirect(`${returnTo}?entitlement=1`)
}

export async function setEntitlementInstantAction(_: ActionState, form: FormData): Promise<ActionState> {
  await requirePlatformPermission("subscriptions.manage")
  const requestId = randomUUID()
  const businessId = text(form, "businessId"), capability = text(form, "capability").toLowerCase()
  const enabled = text(form, "enabled") === "true"
  if (!supportedServiceKeys.has(capability) || !["true", "false"].includes(text(form, "enabled"))) return { error: "Invalid service change.", requestId }
  try {
    const client = await createClient()
    const result = await client.rpc("platform_set_entitlement", { p_business_id: businessId, p_capability: capability, p_enabled: enabled, p_expected_updated_at: text(form, "updatedAt") || null, p_request_id: requestId })
    if (result.error) return { error: result.error.code === "PT409" ? "This service changed in another session. Refresh before retrying." : "The service could not be updated. No change was saved.", requestId }
    revalidatePath(`/restaurants/${businessId}`)
    return { success: true, enabled, updatedAt: result.data, requestId }
  } catch { return { error: "The result could not be confirmed. Refresh before retrying.", requestId } }
}

export async function upsertIntegrationStatusAction(form: FormData) {
  const context = await requirePlatformPermission("integrations.manage")
  const admin = createPlatformAdminClient()
  if (!admin) return mutationFailure(form, "/integrations?error=configuration")
  const businessId = text(form, "businessId"), provider = text(form, "provider").toUpperCase(), status = text(form, "status")
  const scope = await verifyPlatformScope(admin, businessId, "")
  if (!scope || !/^[A-Z][A-Z0-9_-]{1,40}$/.test(provider) || !["MISSING", "INVALID", "NEEDS_REVIEW", "DISABLED"].includes(status)) return mutationFailure(form, "/integrations?error=validation")
  let query = admin.from("platform_integration_status").select("id,business_id,provider,status").eq("provider", provider)
  query = businessId ? query.eq("business_id", businessId) : query.is("business_id", null)
  const existing = await query.maybeSingle()
  const values = { business_id: scope.businessId, provider, status, last_checked_at: new Date().toISOString(), expires_at: text(form, "expiresAt") || null, message: text(form, "message") || null, metadata: {}, updated_at: new Date().toISOString() }
  const result = existing.data
    ? await admin.from("platform_integration_status").update(values).eq("id", existing.data.id).select("id").single()
    : await admin.from("platform_integration_status").insert(values).select("id").single()
  if (result.error || !result.data) return mutationFailure(form, "/integrations?error=save")
  await admin.from("platform_audit_logs").insert({ actor_user_id: context.userId, action: "INTEGRATION_STATUS_UPDATED", target_type: "platform_integration_status", target_id: result.data.id, business_id: scope.businessId, reason: text(form, "reason") || "Integration readiness reviewed", before_data: existing.data, after_data: { provider, status } })
  revalidatePath("/integrations")
  redirect("/integrations?saved=1")
}

export async function createTaskAction(form: FormData) {
  const context = await requirePlatformPermission("tasks.manage")
  const admin = createPlatformAdminClient()
  if (!admin) return mutationFailure(form, "/tasks?error=configuration")
  const businessId = text(form, "businessId"), assigned = text(form, "assignedStaffUserId"), team = text(form, "team"), priority = text(form, "priority"), title = text(form, "title")
  const scope = await verifyPlatformScope(admin, businessId, "")
  const staff = assigned ? await admin.from("platform_staff").select("user_id").eq("user_id", assigned).eq("status", "ACTIVE").maybeSingle() : { data: null }
  if (!scope || (assigned && !staff.data) || title.length < 3 || !["SALES", "ONBOARDING", "SUPPORT", "DEVELOPMENT", "DEPLOYMENT", "BILLING", "OPERATIONS"].includes(team) || !["LOW", "NORMAL", "HIGH", "URGENT"].includes(priority)) return mutationFailure(form, "/tasks?error=validation")
  const { data, error } = await admin.from("platform_tasks").insert({ business_id: scope.businessId, title, team, priority, assigned_staff_user_id: assigned || null, due_at: text(form, "dueAt") || null, created_by: context.userId }).select("id").single()
  if (error || !data) return mutationFailure(form, "/tasks?error=create")
  await admin.from("platform_audit_logs").insert({ actor_user_id: context.userId, action: "PLATFORM_TASK_CREATED", target_type: "platform_tasks", target_id: data.id, business_id: scope.businessId, reason: text(form, "reason") || "Operational task assigned", after_data: { title, team, priority, assigned } })
  revalidatePath("/tasks")
  redirect("/tasks?created=1")
}

export async function updateTaskStatusAction(form: FormData) {
  const context = await requirePlatformPermission("tasks.manage")
  const admin = createPlatformAdminClient()
  if (!admin) return mutationFailure(form, "/tasks?error=configuration")
  const taskId = text(form, "taskId"), status = text(form, "status")
  if (!taskId || !["OPEN", "IN_PROGRESS", "WAITING_CLIENT", "WAITING_QAZIPRO", "BLOCKED", "RESOLVED", "CLOSED"].includes(status)) return mutationFailure(form, "/tasks?error=validation")
  const before = await admin.from("platform_tasks").select("id,business_id,status").eq("id", taskId).maybeSingle()
  if (!before.data) return mutationFailure(form, "/tasks?error=missing")
  const values = { status, completed_at: ["RESOLVED", "CLOSED"].includes(status) ? new Date().toISOString() : null, updated_at: new Date().toISOString() }
  const { error } = await admin.from("platform_tasks").update(values).eq("id", taskId)
  if (error) return mutationFailure(form, "/tasks?error=update")
  await admin.from("platform_audit_logs").insert({ actor_user_id: context.userId, action: "PLATFORM_TASK_STATUS_UPDATED", target_type: "platform_tasks", target_id: taskId, business_id: before.data.business_id, reason: text(form, "reason") || "Task workflow updated", before_data: before.data, after_data: values })
  revalidatePath("/tasks")
  redirect("/tasks?updated=1")
}

export async function signOutAction() {
  const supabase = await createClient()
  await supabase.auth.signOut({ scope: "local" })
  redirect("/login")
}
