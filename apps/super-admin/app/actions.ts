"use server"

import { createHash, randomBytes, randomUUID } from "node:crypto"
import { revalidatePath } from "next/cache"
import { redirect } from "next/navigation"
import { requirePlatformPermission } from "@/lib/auth"
import { createClient } from "@/lib/supabase/server"
import { createPlatformAdminClient } from "@/lib/supabase/admin"
import { slugifyRestaurant, type RestaurantLifecycle } from "@/lib/platform"

export type ActionState = { error?: string; requestId?: string }

const text = (form: FormData, name: string) => String(form.get(name) ?? "").trim()
const money = (form: FormData, name: string) => Math.max(0, Math.round(Number(form.get(name)) || 0))
const tokenHash = (value: string) => createHash("sha256").update(value).digest("hex")

export async function provisionRestaurantAction(_: ActionState, form: FormData): Promise<ActionState> {
  await requirePlatformPermission("restaurants.create")
  await requirePlatformPermission("onboarding.manage")
  const requestId = randomUUID()
  const name = text(form, "name")
  const ownerEmail = text(form, "ownerEmail").toLowerCase()
  const slug = slugifyRestaurant(text(form, "slug") || name)
  const branchNames = form.getAll("branchName").map(String).map((value) => value.trim()).filter(Boolean)
  const branchCodes = form.getAll("branchCode").map(String).map((value) => value.trim()).filter(Boolean)
  if (name.length < 2 || !slug || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(ownerEmail) || !branchNames.length) {
    return { error: "Restaurant name, owner email and at least one branch are required.", requestId }
  }
  const services = form.getAll("services").map(String)
  const payload = {
    name,
    slug,
    legalName: text(form, "legalName"),
    description: text(form, "description"),
    ownerName: text(form, "ownerName"),
    ownerEmail,
    ownerPhone: text(form, "ownerPhone"),
    contactName: text(form, "contactName"),
    contactTitle: text(form, "contactTitle"),
    phone: text(form, "phone"),
    address: text(form, "address"),
    city: text(form, "city"),
    countryCode: text(form, "countryCode").toUpperCase() || "PK",
    currency: text(form, "currency").toUpperCase() || "PKR",
    timezone: text(form, "timezone") || "Asia/Karachi",
    primaryColor: text(form, "primaryColor") || "#a92114",
    secondaryColor: text(form, "secondaryColor") || "#e7a81a",
    logoUrl: text(form, "logoUrl"),
    packageId: text(form, "packageId"),
    baseFee: money(form, "baseFee"),
    setupFee: money(form, "setupFee"),
    billingFrequency: text(form, "billingFrequency") || "MONTHLY",
    commercialNotes: text(form, "commercialNotes"),
    services,
    branches: branchNames.map((branchName, index) => ({
      name: branchName,
      code: (branchCodes[index] || `B${index + 1}`).toUpperCase(),
      address: text(form, `branchAddress${index}`) || text(form, "address"),
      city: text(form, "city"),
      pickupEnabled: true,
      deliveryEnabled: form.get("deliveryEnabled") === "on",
    })),
    customerDomain: text(form, "customerDomain"),
    adminDomain: text(form, "adminDomain"),
    androidEnabled: services.includes("mobile.android"),
    androidName: text(form, "androidName") || name,
    androidId: text(form, "androidId"),
    iosEnabled: services.includes("mobile.ios"),
    iosName: text(form, "iosName") || name,
    iosId: text(form, "iosId"),
    reason: "Guided Super Admin onboarding",
  }
  const supabase = await createClient()
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
    const invitation = await admin.auth.admin.inviteUserByEmail(ownerEmail, {
      redirectTo: `${process.env.RESTAURANT_ADMIN_URL.replace(/\/$/, "")}/auth/callback`,
      data: { invited_business_id: data, invited_role: "OWNER" },
    })
    await admin.from("staff_invitations").update({
      delivery_status: invitation.error ? "FAILED" : "SENT",
      updated_at: new Date().toISOString(),
    }).eq("business_id", data).eq("email", ownerEmail)
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
  redirect(error ? "/packages?error=create" : "/packages?created=1")
}

export async function addBranchAction(form: FormData) {
  await requirePlatformPermission("branches.manage")
  const businessId = text(form, "businessId")
  const supabase = await createClient()
  const { error } = await supabase.rpc("platform_add_branch", {
    p_business_id: businessId,
    p_payload: {
      name: text(form, "name"), code: text(form, "code"), address: text(form, "address"), city: text(form, "city"),
      countryCode: text(form, "countryCode").toUpperCase() || "PK", timezone: text(form, "timezone") || "Asia/Karachi",
      pickupEnabled: form.get("pickupEnabled") === "on", deliveryEnabled: form.get("deliveryEnabled") === "on", reason: text(form, "reason"),
    },
  })
  revalidatePath(`/restaurants/${businessId}`)
  revalidatePath("/branches")
  redirect(error ? `/restaurants/${businessId}?error=branch` : `/restaurants/${businessId}?branch=created`)
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
  if (error) redirect(`/restaurants/${businessId}?error=transition`)
  revalidatePath(`/restaurants/${businessId}`)
  revalidatePath("/restaurants")
  redirect(`/restaurants/${businessId}?updated=1`)
}

export async function createAgreementAction(form: FormData) {
  const context = await requirePlatformPermission("onboarding.manage")
  const onboardingId = text(form, "onboardingId")
  const version = text(form, "version")
  const legalText = text(form, "legalText")
  if (!onboardingId || version.length < 1 || legalText.length < 20) redirect(`/onboarding/${onboardingId}/agreement?error=validation`)
  const admin = createPlatformAdminClient()
  if (!admin) redirect(`/onboarding/${onboardingId}/agreement?error=configuration`)
  const { data: onboarding } = await admin.from("restaurant_onboarding").select("id,business_id,owner_name,owner_email,commercial_notes").eq("id", onboardingId).maybeSingle()
  if (!onboarding) redirect("/onboarding?error=missing")
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
  if (error || !document) redirect(`/onboarding/${onboardingId}/agreement?error=create`)
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
  if (!admin) redirect(`/onboarding/${onboardingId}/agreement?error=configuration`)
  const now = new Date().toISOString()
  const { data: document, error } = await admin.from("onboarding_documents").update({ status: "APPROVED", approved_by: context.userId, approved_at: now, updated_at: now }).eq("id", documentId).eq("status", "SIGNED").select("id,onboarding_id,restaurant_onboarding(business_id)").maybeSingle()
  if (error || !document) redirect(`/onboarding/${onboardingId}/agreement?error=approve`)
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
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email) || displayName.length < 2) redirect("/team?error=validation")
  const admin = createPlatformAdminClient()
  if (!admin) redirect("/team?error=configuration")
  const { data: role } = await admin.from("platform_roles").select("id,key").eq("key", roleKey).maybeSingle()
  if (!role || role.key === "PLATFORM_OWNER") redirect("/team?error=role")
  const redirectTo = `${(process.env.PLATFORM_PUBLIC_URL ?? "http://localhost:3002").replace(/\/$/, "")}/auth/callback`
  const invited = await admin.auth.admin.inviteUserByEmail(email, { redirectTo, data: { full_name: displayName, qazipro_platform_invite: true } })
  if (invited.error || !invited.data.user) redirect("/team?error=invite")
  await admin.from("platform_staff").upsert({ user_id: invited.data.user.id, display_name: displayName, email, status: "INVITED", mfa_required: form.get("mfaRequired") === "on", updated_at: new Date().toISOString() }, { onConflict: "user_id" })
  await admin.from("platform_staff_roles").upsert({ staff_user_id: invited.data.user.id, role_id: role.id, assigned_by: context.userId }, { onConflict: "staff_user_id,role_id" })
  await admin.from("platform_audit_logs").insert({ actor_user_id: context.userId, action: "PLATFORM_STAFF_INVITED", target_type: "platform_staff", target_id: invited.data.user.id, reason: text(form, "reason") || "QaziPro team invitation", after_data: { email, role: roleKey } })
  revalidatePath("/team")
  redirect("/team?invited=1")
}

export async function revokePlatformStaffAction(form: FormData) {
  const context = await requirePlatformPermission("team.manage")
  const userId = text(form, "userId")
  if (!userId || userId === context.userId) redirect("/team?error=self")
  const admin = createPlatformAdminClient()
  if (!admin) redirect("/team?error=configuration")
  const now = new Date().toISOString()
  const { error } = await admin.from("platform_staff").update({ status: "REVOKED", access_revoked_at: now, updated_at: now }).eq("user_id", userId)
  if (error) redirect("/team?error=revoke")
  await admin.from("platform_audit_logs").insert({ actor_user_id: context.userId, action: "PLATFORM_STAFF_REVOKED", target_type: "platform_staff", target_id: userId, reason: text(form, "reason") || "Platform access revoked" })
  revalidatePath("/team")
  redirect("/team?revoked=1")
}

export async function setStaffPermissionAction(form: FormData) {
  const context = await requirePlatformPermission("team.manage")
  const admin = createPlatformAdminClient()
  if (!admin) redirect("/team?error=configuration")
  const actorRole = await admin.from("platform_staff_roles").select("platform_roles(key)").eq("staff_user_id", context.userId)
  const owner = (actorRole.data ?? []).some((row) => {
    const relation = row.platform_roles as { key?: string } | { key?: string }[] | null
    return Array.isArray(relation) ? relation.some((item) => item.key === "PLATFORM_OWNER") : relation?.key === "PLATFORM_OWNER"
  })
  if (!owner) redirect("/team?error=owner-only")
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
  if (!staff.data || staff.data.status === "REVOKED" || !permissionRow.data || !["ALLOW", "DENY", "INHERIT"].includes(mode) || userId === context.userId || targetIsOwner) redirect("/team?error=validation")
  const prior = await admin.from("platform_staff_permissions").select("permission_key,allowed").eq("staff_user_id", userId).eq("permission_key", permission).maybeSingle()
  const changed = mode === "INHERIT"
    ? await admin.from("platform_staff_permissions").delete().eq("staff_user_id", userId).eq("permission_key", permission)
    : await admin.from("platform_staff_permissions").upsert({ staff_user_id: userId, permission_key: permission, allowed: mode === "ALLOW", assigned_by: context.userId, assigned_at: new Date().toISOString() }, { onConflict: "staff_user_id,permission_key" })
  if (changed.error) redirect("/team?error=permission")
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
  if (!admin) redirect("/health?error=configuration")
  const businessId = text(form, "businessId"), branchId = text(form, "branchId")
  const scope = await verifyPlatformScope(admin, businessId, branchId)
  const severity = text(form, "severity"), environment = text(form, "environment"), title = text(form, "title"), component = text(form, "component"), summary = text(form, "summary")
  if (!scope || !["INFO", "WARNING", "CRITICAL"].includes(severity) || !["LOCAL", "STAGING", "PRODUCTION"].includes(environment) || title.length < 3 || component.length < 2 || summary.length < 5) redirect("/health?error=validation")
  const { data, error } = await admin.from("platform_incidents").insert({ business_id: scope.businessId, branch_id: scope.branchId, severity, health_state: severity === "CRITICAL" ? "CRITICAL" : severity === "WARNING" ? "WARNING" : "UNKNOWN", environment, component, title, summary, technical_details: text(form, "technicalDetails") || null, request_id: text(form, "requestId") || null, status: "OPEN", assigned_staff_user_id: context.userId }).select("id").single()
  if (error || !data) redirect("/health?error=create")
  await admin.from("platform_audit_logs").insert({ actor_user_id: context.userId, action: "PLATFORM_INCIDENT_OPENED", target_type: "platform_incidents", target_id: data.id, business_id: scope.businessId, reason: text(form, "reason") || "Operational incident opened", after_data: { severity, environment, component } })
  revalidatePath("/health")
  redirect("/health?created=1")
}

export async function createSupportTicketAction(form: FormData) {
  const context = await requirePlatformPermission("support.access")
  const admin = createPlatformAdminClient()
  if (!admin) redirect("/support?error=configuration")
  const businessId = text(form, "businessId"), branchId = text(form, "branchId")
  const scope = await verifyPlatformScope(admin, businessId, branchId)
  const severity = text(form, "severity"), subject = text(form, "subject"), description = text(form, "description")
  if (!scope?.businessId || !["LOW", "NORMAL", "HIGH", "CRITICAL"].includes(severity) || subject.length < 3 || description.length < 5) redirect("/support?error=validation")
  const { data, error } = await admin.from("support_tickets").insert({ business_id: scope.businessId, branch_id: scope.branchId, category: text(form, "category") || "GENERAL", severity, subject, description, status: "OPEN", assigned_staff_user_id: context.userId, created_by: context.userId }).select("id,ticket_number").single()
  if (error || !data) redirect("/support?error=create")
  await admin.from("platform_audit_logs").insert({ actor_user_id: context.userId, action: "SUPPORT_TICKET_OPENED", target_type: "support_tickets", target_id: data.id, business_id: scope.businessId, reason: text(form, "reason") || "Client support request opened", after_data: { ticketNumber: data.ticket_number, severity } })
  revalidatePath("/support")
  redirect("/support?created=1")
}

export async function recordDeploymentAction(form: FormData) {
  const context = await requirePlatformPermission("deployments.manage")
  const admin = createPlatformAdminClient()
  if (!admin) redirect("/deployments?error=configuration")
  const businessId = text(form, "businessId"), component = text(form, "component"), environment = text(form, "environment"), status = text(form, "status")
  const scope = await verifyPlatformScope(admin, businessId, "")
  const components = ["CUSTOMER_WEBSITE", "RESTAURANT_ADMIN", "BACKEND_API", "DESKTOP_POS", "ANDROID", "IOS", "SUPER_ADMIN"]
  if (!scope || !components.includes(component) || !["LOCAL", "STAGING", "PRODUCTION"].includes(environment) || !["QUEUED", "BUILDING", "READY", "FAILED", "CANCELLED", "ROLLED_BACK"].includes(status)) redirect("/deployments?error=validation")
  const { data, error } = await admin.from("deployment_records").insert({ business_id: scope.businessId, component, environment, version: text(form, "version") || null, commit_sha: text(form, "commitSha") || null, provider: text(form, "provider") || null, provider_reference: text(form, "providerReference") || null, status, initiated_by: context.userId, started_at: new Date().toISOString(), finished_at: ["READY", "FAILED", "CANCELLED", "ROLLED_BACK"].includes(status) ? new Date().toISOString() : null, error_summary: status === "FAILED" ? text(form, "errorSummary") || "Failure details pending" : null }).select("id").single()
  if (error || !data) redirect("/deployments?error=create")
  await admin.from("platform_audit_logs").insert({ actor_user_id: context.userId, action: "DEPLOYMENT_RECORDED", target_type: "deployment_records", target_id: data.id, business_id: scope.businessId, reason: text(form, "reason") || "Deployment evidence recorded", after_data: { component, environment, status } })
  revalidatePath("/deployments")
  redirect("/deployments?created=1")
}

export async function setBranchStatusAction(form: FormData) {
  const context = await requirePlatformPermission("branches.manage")
  const admin = createPlatformAdminClient()
  if (!admin) redirect("/branches?error=configuration")
  const businessId = text(form, "businessId"), branchId = text(form, "branchId")
  const scope = await verifyPlatformScope(admin, businessId, branchId)
  const active = text(form, "active") === "true"
  const { data: before } = scope?.branchId
    ? await admin.from("branches").select("id,is_active,online_ordering_enabled").eq("id", scope.branchId).eq("business_id", businessId).maybeSingle()
    : { data: null }
  if (!scope?.branchId || !before) redirect("/branches?error=scope")
  if (!active) {
    const remaining = await admin.from("branches").select("id", { count: "exact", head: true }).eq("business_id", businessId).eq("is_active", true).neq("id", branchId)
    if (remaining.error || !remaining.count) redirect("/branches?error=last-active")
  }
  const patch = active ? { is_active: true } : { is_active: false, online_ordering_enabled: false }
  const { error } = await admin.from("branches").update(patch).eq("id", branchId).eq("business_id", businessId)
  if (error) redirect("/branches?error=update")
  await admin.from("platform_audit_logs").insert({ actor_user_id: context.userId, action: active ? "BRANCH_ACTIVATED" : "BRANCH_DEACTIVATED", target_type: "branches", target_id: branchId, business_id: businessId, reason: text(form, "reason") || "Platform branch status change", before_data: before, after_data: patch })
  revalidatePath("/branches")
  revalidatePath(`/restaurants/${businessId}`)
  redirect("/branches?updated=1")
}

export async function upsertDomainAction(form: FormData) {
  const context = await requirePlatformPermission("domains.manage")
  const admin = createPlatformAdminClient()
  if (!admin) redirect("/domains?error=configuration")
  const businessId = text(form, "businessId"), purpose = text(form, "purpose")
  const hostname = text(form, "hostname").toLowerCase().replace(/^https?:\/\//, "").replace(/\/$/, "")
  const scope = await verifyPlatformScope(admin, businessId, "")
  if (!scope?.businessId || !["CUSTOMER", "ADMIN", "APP_LINKS", "OTHER"].includes(purpose) || !/^(?=.{4,253}$)(?!-)[a-z0-9-]+(?:\.[a-z0-9-]+)+$/.test(hostname)) redirect("/domains?error=validation")
  const existing = await admin.from("platform_domain_records").select("id,business_id,hostname,purpose").eq("hostname", hostname).maybeSingle()
  if (existing.data && existing.data.business_id !== businessId) redirect("/domains?error=conflict")
  const values = { business_id: businessId, hostname, purpose, verification_status: "PENDING", dns_status: "UNKNOWN", ssl_status: "UNKNOWN", auth_redirect_ready: false, failure_summary: null, updated_at: new Date().toISOString() }
  const result = existing.data
    ? await admin.from("platform_domain_records").update(values).eq("id", existing.data.id).select("id").single()
    : await admin.from("platform_domain_records").insert(values).select("id").single()
  if (result.error || !result.data) redirect("/domains?error=save")
  await admin.from("platform_audit_logs").insert({ actor_user_id: context.userId, action: existing.data ? "DOMAIN_CONFIGURATION_UPDATED" : "DOMAIN_CONFIGURATION_CREATED", target_type: "platform_domain_records", target_id: result.data.id, business_id: businessId, reason: text(form, "reason") || "Domain configuration recorded", before_data: existing.data, after_data: { hostname, purpose, verification_status: "PENDING" } })
  revalidatePath("/domains")
  revalidatePath(`/restaurants/${businessId}`)
  redirect("/domains?saved=1")
}

export async function upsertMobileAppAction(form: FormData) {
  const context = await requirePlatformPermission("apps.manage")
  const admin = createPlatformAdminClient()
  if (!admin) redirect("/apps?error=configuration")
  const businessId = text(form, "businessId"), platform = text(form, "platform"), applicationIdentifier = text(form, "applicationIdentifier").toLowerCase()
  const enabled = form.get("enabled") === "on"
  const scope = await verifyPlatformScope(admin, businessId, "")
  const business = scope?.businessId ? await admin.from("businesses").select("slug").eq("id", businessId).single() : { data: null }
  if (!scope?.businessId || !business.data?.slug || !["ANDROID", "IOS"].includes(platform) || (enabled && (!/^[a-z][a-z0-9]*(\.[a-z][a-z0-9]*){2,}$/.test(applicationIdentifier) || text(form, "appName").length < 2)) || !["MISSING", "INVALID", "NEEDS_REVIEW", "DISABLED"].includes(text(form, "credentialStatus") || "MISSING") || !["CONFIGURATION", "CREDENTIALS_REQUIRED", "FAILED", "UPDATE_REQUIRED"].includes(text(form, "releaseStatus") || "CONFIGURATION")) redirect("/apps?error=validation")
  const existing = await admin.from("mobile_app_records").select("id,business_id,platform,application_identifier,release_status").eq("business_id", businessId).eq("platform", platform).maybeSingle()
  const values = { business_id: businessId, platform, enabled, app_name: text(form, "appName") || null, application_identifier: applicationIdentifier || null, restaurant_public_key: business.data.slug, version_name: text(form, "versionName") || null, build_number: money(form, "buildNumber") || null, credential_status: text(form, "credentialStatus") || "MISSING", release_status: enabled ? text(form, "releaseStatus") || "CONFIGURATION" : "NOT_PURCHASED", store_url: text(form, "storeUrl") || null, updated_at: new Date().toISOString() }
  const result = existing.data
    ? await admin.from("mobile_app_records").update(values).eq("id", existing.data.id).select("id").single()
    : await admin.from("mobile_app_records").insert(values).select("id").single()
  if (result.error || !result.data) redirect(`/apps?error=${result.error?.code === "23505" ? "conflict" : "save"}`)
  await admin.from("platform_audit_logs").insert({ actor_user_id: context.userId, action: "MOBILE_APP_CONFIGURATION_SAVED", target_type: "mobile_app_records", target_id: result.data.id, business_id: businessId, reason: text(form, "reason") || "Mobile app registry update", before_data: existing.data, after_data: { platform, enabled, applicationIdentifier, releaseStatus: values.release_status } })
  revalidatePath("/apps")
  revalidatePath(`/restaurants/${businessId}`)
  redirect("/apps?saved=1")
}

export async function updateSubscriptionAction(form: FormData) {
  const context = await requirePlatformPermission("billing.edit")
  const admin = createPlatformAdminClient()
  if (!admin) redirect("/billing?error=configuration")
  const businessId = text(form, "businessId"), packageId = text(form, "packageId"), status = text(form, "status")
  const scope = await verifyPlatformScope(admin, businessId, "")
  const packageResult = packageId ? await admin.from("service_packages").select("id").eq("id", packageId).eq("is_active", true).maybeSingle() : { data: null }
  if (!scope?.businessId || (packageId && !packageResult.data) || !["TRIAL", "ACTIVE", "PAST_DUE", "GRACE_PERIOD", "SUSPENDED", "CANCELLED"].includes(status)) redirect("/billing?error=validation")
  const before = await admin.from("restaurant_subscriptions").select("*").eq("business_id", businessId).maybeSingle()
  const values = { business_id: businessId, package_id: packageId || null, status, currency: text(form, "currency").toUpperCase() || "PKR", base_fee: money(form, "baseFee"), setup_fee: money(form, "setupFee"), branch_fee: money(form, "branchFee"), terminal_fee: money(form, "terminalFee"), android_fee: money(form, "androidFee"), ios_fee: money(form, "iosFee"), discount: money(form, "discount"), tax: money(form, "tax"), billing_frequency: text(form, "billingFrequency") || "MONTHLY", next_invoice_date: text(form, "nextInvoiceDate") || null, notes: text(form, "notes"), updated_at: new Date().toISOString() }
  const result = await admin.from("restaurant_subscriptions").upsert(values, { onConflict: "business_id" }).select("id").single()
  if (result.error || !result.data) redirect("/billing?error=save")
  await admin.from("platform_audit_logs").insert({ actor_user_id: context.userId, action: "SUBSCRIPTION_UPDATED", target_type: "restaurant_subscriptions", target_id: result.data.id, business_id: businessId, reason: text(form, "reason") || "Commercial record updated", before_data: before.data, after_data: values })
  revalidatePath("/billing")
  revalidatePath(`/restaurants/${businessId}`)
  redirect("/billing?saved=1")
}

export async function setEntitlementAction(form: FormData) {
  const context = await requirePlatformPermission("subscriptions.manage")
  const admin = createPlatformAdminClient()
  if (!admin) redirect("/billing?error=configuration")
  const businessId = text(form, "businessId"), capability = text(form, "capability").toLowerCase()
  const scope = await verifyPlatformScope(admin, businessId, "")
  if (!scope?.businessId || !/^[a-z][a-z0-9_.-]+$/.test(capability)) redirect("/billing?error=entitlement")
  const values = { business_id: businessId, capability_key: capability, source: "OVERRIDE", enabled: text(form, "enabled") === "true", effective_until: text(form, "effectiveUntil") || null, notes: text(form, "notes"), updated_at: new Date().toISOString() }
  const result = await admin.from("service_entitlements").upsert(values, { onConflict: "business_id,capability_key,source" }).select("id").single()
  if (result.error || !result.data) redirect("/billing?error=entitlement-save")
  await admin.from("platform_audit_logs").insert({ actor_user_id: context.userId, action: "ENTITLEMENT_OVERRIDE_SAVED", target_type: "service_entitlements", target_id: result.data.id, business_id: businessId, reason: text(form, "reason") || "Restaurant capability override", after_data: values })
  revalidatePath("/billing")
  revalidatePath(`/restaurants/${businessId}`)
  redirect("/billing?entitlement=1")
}

export async function upsertIntegrationStatusAction(form: FormData) {
  const context = await requirePlatformPermission("integrations.manage")
  const admin = createPlatformAdminClient()
  if (!admin) redirect("/integrations?error=configuration")
  const businessId = text(form, "businessId"), provider = text(form, "provider").toUpperCase(), status = text(form, "status")
  const scope = await verifyPlatformScope(admin, businessId, "")
  if (!scope || !/^[A-Z][A-Z0-9_-]{1,40}$/.test(provider) || !["MISSING", "INVALID", "NEEDS_REVIEW", "DISABLED"].includes(status)) redirect("/integrations?error=validation")
  let query = admin.from("platform_integration_status").select("id,business_id,provider,status").eq("provider", provider)
  query = businessId ? query.eq("business_id", businessId) : query.is("business_id", null)
  const existing = await query.maybeSingle()
  const values = { business_id: scope.businessId, provider, status, last_checked_at: new Date().toISOString(), expires_at: text(form, "expiresAt") || null, message: text(form, "message") || null, metadata: {}, updated_at: new Date().toISOString() }
  const result = existing.data
    ? await admin.from("platform_integration_status").update(values).eq("id", existing.data.id).select("id").single()
    : await admin.from("platform_integration_status").insert(values).select("id").single()
  if (result.error || !result.data) redirect("/integrations?error=save")
  await admin.from("platform_audit_logs").insert({ actor_user_id: context.userId, action: "INTEGRATION_STATUS_UPDATED", target_type: "platform_integration_status", target_id: result.data.id, business_id: scope.businessId, reason: text(form, "reason") || "Integration readiness reviewed", before_data: existing.data, after_data: { provider, status } })
  revalidatePath("/integrations")
  redirect("/integrations?saved=1")
}

export async function createTaskAction(form: FormData) {
  const context = await requirePlatformPermission("tasks.manage")
  const admin = createPlatformAdminClient()
  if (!admin) redirect("/tasks?error=configuration")
  const businessId = text(form, "businessId"), assigned = text(form, "assignedStaffUserId"), team = text(form, "team"), priority = text(form, "priority"), title = text(form, "title")
  const scope = await verifyPlatformScope(admin, businessId, "")
  const staff = assigned ? await admin.from("platform_staff").select("user_id").eq("user_id", assigned).eq("status", "ACTIVE").maybeSingle() : { data: null }
  if (!scope || (assigned && !staff.data) || title.length < 3 || !["SALES", "ONBOARDING", "SUPPORT", "DEVELOPMENT", "DEPLOYMENT", "BILLING", "OPERATIONS"].includes(team) || !["LOW", "NORMAL", "HIGH", "URGENT"].includes(priority)) redirect("/tasks?error=validation")
  const { data, error } = await admin.from("platform_tasks").insert({ business_id: scope.businessId, title, team, priority, assigned_staff_user_id: assigned || null, due_at: text(form, "dueAt") || null, created_by: context.userId }).select("id").single()
  if (error || !data) redirect("/tasks?error=create")
  await admin.from("platform_audit_logs").insert({ actor_user_id: context.userId, action: "PLATFORM_TASK_CREATED", target_type: "platform_tasks", target_id: data.id, business_id: scope.businessId, reason: text(form, "reason") || "Operational task assigned", after_data: { title, team, priority, assigned } })
  revalidatePath("/tasks")
  redirect("/tasks?created=1")
}

export async function updateTaskStatusAction(form: FormData) {
  const context = await requirePlatformPermission("tasks.manage")
  const admin = createPlatformAdminClient()
  if (!admin) redirect("/tasks?error=configuration")
  const taskId = text(form, "taskId"), status = text(form, "status")
  if (!taskId || !["OPEN", "IN_PROGRESS", "WAITING_CLIENT", "WAITING_QAZIPRO", "BLOCKED", "RESOLVED", "CLOSED"].includes(status)) redirect("/tasks?error=validation")
  const before = await admin.from("platform_tasks").select("id,business_id,status").eq("id", taskId).maybeSingle()
  if (!before.data) redirect("/tasks?error=missing")
  const values = { status, completed_at: ["RESOLVED", "CLOSED"].includes(status) ? new Date().toISOString() : null, updated_at: new Date().toISOString() }
  const { error } = await admin.from("platform_tasks").update(values).eq("id", taskId)
  if (error) redirect("/tasks?error=update")
  await admin.from("platform_audit_logs").insert({ actor_user_id: context.userId, action: "PLATFORM_TASK_STATUS_UPDATED", target_type: "platform_tasks", target_id: taskId, business_id: before.data.business_id, reason: text(form, "reason") || "Task workflow updated", before_data: before.data, after_data: values })
  revalidatePath("/tasks")
  redirect("/tasks?updated=1")
}

export async function signOutAction() {
  const supabase = await createClient()
  await supabase.auth.signOut({ scope: "local" })
  redirect("/login")
}
