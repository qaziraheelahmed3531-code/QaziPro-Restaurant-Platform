import { randomUUID } from "node:crypto"
import { createClient } from "@supabase/supabase-js"

const url = process.env.NEXT_PUBLIC_SUPABASE_URL
const publicKey = process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY
const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY
const expectedRef = process.env.STAGING_SUPABASE_PROJECT_REF
if (!url || !publicKey || !serviceKey || expectedRef !== "jzisqjvroxodvmqxzsob" || !url.includes(expectedRef)) {
  throw new Error("Refusing to run outside the verified staging Supabase project.")
}

const service = createClient(url, serviceKey, { auth: { persistSession: false, autoRefreshToken: false } })
const email = `qa-admin-access-${randomUUID()}@staging.qazipro.invalid`
const password = `Qa!${randomUUID()}x9`
const businessIds = []
let userId = ""

function checked(result, label) {
  if (result.error) throw new Error(`${label}: ${result.error.code ?? "ERROR"} ${result.error.message}`)
  return result.data
}
function expectReason(value, reason, allowed) {
  if (value?.reason !== reason || value?.allowed !== allowed) throw new Error(`Expected ${reason}/${allowed}, received ${JSON.stringify(value)}`)
}
async function createBusiness(suffix, capability, role = "OWNER") {
  const business = checked(await service.from("businesses").insert({ slug: `qa-access-${suffix}-${randomUUID().slice(0,8)}`, name: `QA Access ${suffix}`, city: "Islamabad", is_active: true }).select("id").single(), "business")
  businessIds.push(business.id)
  const branch = checked(await service.from("branches").insert({ business_id: business.id, code: "B1", name: "QA Branch", city: "Islamabad", is_active: true }).select("id").single(), "branch")
  checked(await service.from("service_entitlements").insert({ business_id: business.id, capability_key: capability, enabled: true, source: "OVERRIDE" }), "entitlement")
  const membership = checked(await service.from("staff_memberships").insert({ business_id: business.id, user_id: userId, branch_id: role === "OWNER" ? null : branch.id, role, is_active: true }).select("id").single(), "membership")
  if (role !== "OWNER") checked(await service.from("staff_membership_branches").insert({ membership_id: membership.id, business_id: business.id, branch_id: branch.id }), "branch assignment")
  return { business, branch, membership }
}

try {
  const created = checked(await service.auth.admin.createUser({ email, password, email_confirm: true, user_metadata: { full_name: "QA Access Gate" } }), "auth user")
  userId = created.user.id
  const owner = await createBusiness("owner", "admin.restaurant")
  const userClient = createClient(url, publicKey, { auth: { persistSession: false, autoRefreshToken: false } })
  checked(await userClient.auth.signInWithPassword({ email, password }), "sign in")

  expectReason(checked(await userClient.rpc("resolve_restaurant_admin_access", { p_business_id: owner.business.id }), "owner authorized"), "AUTHORIZED", true)
  checked(await service.from("businesses").update({ is_active: false }).eq("id", owner.business.id), "deactivate restaurant")
  expectReason(checked(await userClient.rpc("resolve_restaurant_admin_access", { p_business_id: owner.business.id }), "restaurant inactive"), "RESTAURANT_INACTIVE", false)
  checked(await service.from("businesses").update({ is_active: true }).eq("id", owner.business.id), "reactivate restaurant")
  checked(await service.from("service_entitlements").update({ enabled: false }).eq("business_id", owner.business.id).eq("capability_key", "admin.restaurant").eq("source", "OVERRIDE"), "disable entitlement")
  expectReason(checked(await userClient.rpc("resolve_restaurant_admin_access", { p_business_id: owner.business.id }), "entitlement disabled"), "ENTITLEMENT_DISABLED", false)
  checked(await service.from("service_entitlements").update({ enabled: true }).eq("business_id", owner.business.id).eq("capability_key", "admin.restaurant").eq("source", "OVERRIDE"), "enable entitlement")
  expectReason(checked(await userClient.rpc("resolve_restaurant_admin_access", { p_business_id: randomUUID() }), "tenant isolation"), "NO_MEMBERSHIP", false)

  const waiter = await createBusiness("waiter", "waiter", "WAITER")
  expectReason(checked(await userClient.rpc("resolve_restaurant_admin_access", { p_business_id: waiter.business.id }), "waiter authorized"), "AUTHORIZED", true)
  checked(await service.from("staff_memberships").update({ is_active: false }).eq("id", waiter.membership.id), "deactivate membership")
  expectReason(checked(await userClient.rpc("resolve_restaurant_admin_access", { p_business_id: waiter.business.id }), "membership inactive"), "MEMBERSHIP_INACTIVE", false)
  checked(await service.from("staff_memberships").update({ is_active: true }).eq("id", waiter.membership.id), "reactivate membership")
  checked(await service.from("branches").update({ is_active: false }).eq("id", waiter.branch.id), "deactivate assigned branch")
  expectReason(checked(await userClient.rpc("resolve_restaurant_admin_access", { p_business_id: waiter.business.id }), "branch scope"), "BRANCH_ACCESS_MISSING", false)

  const expiredBusiness = checked(await service.from("businesses").insert({ slug: `qa-expired-${randomUUID().slice(0,8)}`, name: "QA Expired Invitation", city: "Islamabad", is_active: true }).select("id").single(), "expired business")
  businessIds.push(expiredBusiness.id)
  const expiredBranch = checked(await service.from("branches").insert({ business_id: expiredBusiness.id, code: "B1", name: "QA Branch", city: "Islamabad", is_active: true }).select("id").single(), "expired branch")
  const expiredInvitation = checked(await service.from("staff_invitations").insert({ business_id: expiredBusiness.id, branch_id: expiredBranch.id, branch_ids: [expiredBranch.id], email, role: "OWNER", invited_by: userId, expires_at: new Date(Date.now()-60000).toISOString(), delivery_status: "SUPPRESSED" }).select("id").single(), "expired invitation")
  expectReason(checked(await userClient.rpc("resolve_restaurant_admin_access", { p_business_id: expiredBusiness.id }), "expired invitation reason"), "INVITATION_EXPIRED", false)
  checked(await userClient.rpc("claim_staff_invitations"), "reject expired invitation")
  const expiredAfter = checked(await service.from("staff_invitations").select("status,is_active").eq("id", expiredInvitation.id).single(), "expired state")
  if (expiredAfter.status !== "EXPIRED" || expiredAfter.is_active) throw new Error("Expired invitation remained claimable.")

  const invitedBusiness = checked(await service.from("businesses").insert({ slug: `qa-invite-${randomUUID().slice(0,8)}`, name: "QA Invitation", city: "Islamabad", is_active: true }).select("id").single(), "invited business")
  businessIds.push(invitedBusiness.id)
  const invitedBranch = checked(await service.from("branches").insert({ business_id: invitedBusiness.id, code: "B1", name: "QA Branch", city: "Islamabad", is_active: true }).select("id").single(), "invited branch")
  checked(await service.from("service_entitlements").insert({ business_id: invitedBusiness.id, capability_key: "admin.restaurant", enabled: true, source: "OVERRIDE" }), "invited entitlement")
  const invitation = checked(await service.from("staff_invitations").insert({ business_id: invitedBusiness.id, branch_id: invitedBranch.id, branch_ids: [invitedBranch.id], email, role: "OWNER", invited_by: userId, expires_at: new Date(Date.now()+3600000).toISOString(), delivery_status: "SUPPRESSED" }).select("id").single(), "invitation")
  checked(await userClient.rpc("claim_staff_invitations"), "claim invitation")
  expectReason(checked(await userClient.rpc("resolve_restaurant_admin_access", { p_business_id: invitedBusiness.id }), "invited owner authorized"), "AUTHORIZED", true)
  const invitationAfter = checked(await service.from("staff_invitations").select("status,activated_user_id,accepted_at").eq("id", invitation.id).single(), "invitation state")
  if (invitationAfter.status !== "ACTIVATED" || invitationAfter.activated_user_id !== userId || !invitationAfter.accepted_at) throw new Error("Invitation activation was not atomic.")

  console.log("PASS restaurant admin access resolver: owner, lifecycle, entitlement, membership, branch, tenant and invitation linking")
} finally {
  for (const businessId of businessIds.reverse()) await service.from("businesses").delete().eq("id", businessId)
  if (userId) await service.auth.admin.deleteUser(userId)
}
