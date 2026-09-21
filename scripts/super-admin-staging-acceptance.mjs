import { randomBytes, randomUUID } from "node:crypto"
import { createClient } from "@supabase/supabase-js"

if (process.env.ALLOW_STAGING_ACCEPTANCE !== "1") throw new Error("Set ALLOW_STAGING_ACCEPTANCE=1 for the isolated staging acceptance run.")
const url = process.env.SUPABASE_URL ?? process.env.NEXT_PUBLIC_SUPABASE_URL
const publicKey = process.env.SUPABASE_ANON_KEY ?? process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY
const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY
const expectedRef = process.env.STAGING_SUPABASE_PROJECT_REF
if (!url || !publicKey || !serviceKey) throw new Error("Staging Supabase URL, public key and server-only service key are required.")
if (process.env.APP_ENVIRONMENT === "production" || process.env.NODE_ENV === "production") throw new Error("Acceptance refuses production environments.")
if (!expectedRef || new URL(url).hostname !== `${expectedRef}.supabase.co`) throw new Error("Staging project ref must explicitly match the Supabase URL.")

const service = createClient(url, serviceKey, { auth: { persistSession: false, autoRefreshToken: false } })
const marker = `qa-super-${Date.now()}`
const password = `${randomBytes(18).toString("base64url")}A1!`
const users = []
const businesses = []
let packageId = null

let assertions = 0
function assert(condition, message) { assertions += 1; if (!condition) throw new Error(message) }
async function platformClient(email) {
  const client = createClient(url, publicKey, { auth: { persistSession: false, autoRefreshToken: false } })
  const { error } = await client.auth.signInWithPassword({ email, password })
  if (error) throw error
  return client
}
async function createIdentity(kind, platformRole) {
  const email = `${marker}-${kind}@qa.example`
  const created = await service.auth.admin.createUser({ email, password, email_confirm: true })
  if (created.error || !created.data.user) throw created.error ?? new Error("QA identity creation failed")
  users.push(created.data.user.id)
  if (platformRole) {
    const role = await service.from("platform_roles").select("id").eq("key", platformRole).single()
    if (role.error) throw role.error
    const staff = await service.from("platform_staff").insert({ user_id: created.data.user.id, display_name: `QA ${kind}`, email, status: "ACTIVE" })
    if (staff.error) throw staff.error
    const assignment = await service.from("platform_staff_roles").insert({ staff_user_id: created.data.user.id, role_id: role.data.id })
    if (assignment.error) throw assignment.error
  }
  return { id: created.data.user.id, email }
}
async function cleanup() {
  for (const businessId of businesses) {
    for (const table of ["platform_tasks","support_tickets","platform_incidents","deployment_records","platform_integration_status","mobile_app_records","platform_domain_records","service_entitlements","restaurant_subscriptions","onboarding_documents"]) {
      if (table === "onboarding_documents") {
        const onboarding = await service.from("restaurant_onboarding").select("id").eq("business_id", businessId)
        for (const row of onboarding.data ?? []) await service.from(table).delete().eq("onboarding_id", row.id)
      } else await service.from(table).delete().eq("business_id", businessId)
    }
    await service.from("staff_invitations").delete().eq("business_id", businessId)
    await service.from("restaurant_onboarding").delete().eq("business_id", businessId)
    await service.from("platform_audit_logs").delete().eq("business_id", businessId)
    await service.from("businesses").delete().eq("id", businessId)
  }
  if (packageId) await service.from("service_packages").delete().eq("id", packageId)
  for (const userId of users) {
    await service.from("platform_audit_logs").delete().eq("actor_user_id", userId)
    await service.from("platform_staff").delete().eq("user_id", userId)
    await service.auth.admin.deleteUser(userId)
  }
}

try {
  const owner = await createIdentity("owner", "PLATFORM_OWNER")
  const support = await createIdentity("support", "SUPPORT_ENGINEER")
  const restaurantUser = await createIdentity("restaurant-user", null)
  const ownerClient = await platformClient(owner.email)
  const supportClient = await platformClient(support.email)
  const restaurantClient = await platformClient(restaurantUser.email)

  const packageResult = await ownerClient.rpc("platform_create_service_package", { p_payload: { code: marker.replaceAll("-", "_").toUpperCase(), name: "QA Growth", currency: "PKR", baseFee: 10000, includedBranches: 2, capabilities: ["admin.restaurant", "pos.web", "website.ordering"], reason: "Staging acceptance" } })
  if (packageResult.error) throw packageResult.error
  packageId = packageResult.data

  async function provision(suffix, services, branchCount, androidEnabled) {
    const requestKey = randomUUID()
    const payload = { name: `QA Restaurant ${suffix}`, slug: `${marker}-${suffix.toLowerCase()}`, ownerName: `Owner ${suffix}`, ownerEmail: `${marker}-${suffix.toLowerCase()}@qa.example`, city: "Islamabad", countryCode: "PK", currency: "PKR", timezone: "Asia/Karachi", packageId, services, branches: Array.from({ length: branchCount }, (_, i) => ({ name: `${suffix} Branch ${i + 1}`, code: `${suffix}${i + 1}`, city: "Islamabad", pickupEnabled: true, deliveryEnabled: i === 0 })), customerDomain: `${marker}-${suffix.toLowerCase()}.example.test`, androidEnabled, androidName: `QA ${suffix}`, androidId: androidEnabled ? `com.qazipro.${marker.replaceAll("-", "")}.${suffix.toLowerCase()}` : "", iosEnabled: false, reason: "Staging acceptance" }
    const first = await ownerClient.rpc("platform_provision_restaurant", { p_request_key: requestKey, p_payload: payload })
    if (first.error) throw first.error
    businesses.push(first.data)
    const retry = await ownerClient.rpc("platform_provision_restaurant", { p_request_key: requestKey, p_payload: { ...payload, name: "Retry must not duplicate" } })
    if (retry.error) throw retry.error
    assert(first.data === retry.data, "Idempotent onboarding retry returned a different restaurant")
    return first.data
  }

  const restaurantA = await provision("A", ["admin.restaurant","pos.web","website.ordering","mobile.android"], 2, true)
  const restaurantB = await provision("B", ["admin.restaurant","pos.desktop"], 1, false)
  const added = await ownerClient.rpc("platform_add_branch", { p_business_id: restaurantA, p_payload: { name: "A Branch 3", code: "A3", city: "Islamabad", countryCode: "PK", reason: "Staging acceptance expansion" } })
  if (added.error) throw added.error
  const [branchesA, branchesB, appsA, appsB, entitlementsB] = await Promise.all([
    service.from("branches").select("id").eq("business_id", restaurantA), service.from("branches").select("id").eq("business_id", restaurantB),
    service.from("mobile_app_records").select("enabled").eq("business_id", restaurantA).eq("platform", "ANDROID").single(),
    service.from("mobile_app_records").select("enabled").eq("business_id", restaurantB).eq("platform", "ANDROID").single(),
    service.from("service_entitlements").select("id").eq("business_id", restaurantB).eq("capability_key", "mobile.android"),
  ])
  assert(branchesA.data?.length === 3 && branchesB.data?.length === 1, "Restaurant branch separation failed")
  assert(appsA.data?.enabled === true && appsB.data?.enabled === false && entitlementsB.data?.length === 0, "Restaurant service separation failed")

  const deniedBranch = await supportClient.rpc("platform_add_branch", { p_business_id: restaurantB, p_payload: { name: "Forged", code: "X" } })
  assert(deniedBranch.error?.code === "42501", "Support role performed unauthorized branch mutation")
  const directDeny = await service.from("platform_staff_permissions").insert({ staff_user_id: support.id, permission_key: "support.access", allowed: false, assigned_by: owner.id })
  if (directDeny.error) throw directDeny.error
  const afterDeny = await supportClient.rpc("platform_effective_permissions")
  assert(!afterDeny.error && !afterDeny.data.includes("support.access"), "Direct permission deny did not override role")
  const removeDeny = await service.from("platform_staff_permissions").delete().eq("staff_user_id", support.id).eq("permission_key", "support.access")
  if (removeDeny.error) throw removeDeny.error
  const hiddenStaff = await restaurantClient.from("platform_staff").select("user_id")
  assert(!hiddenStaff.error && hiddenStaff.data.length === 0, "Restaurant user read QaziPro platform staff")
  const deniedPackage = await restaurantClient.rpc("platform_create_service_package", { p_payload: { code: "FORGED", name: "Forged" } })
  assert(deniedPackage.error?.code === "42501", "Restaurant user invoked privileged platform RPC")
  const deniedMetrics = await restaurantClient.rpc("platform_today_order_metrics")
  assert(deniedMetrics.error?.code === "42501", "Restaurant user read platform-wide order metrics")
  const platformMetrics = await ownerClient.rpc("platform_today_order_metrics")
  assert(!platformMetrics.error && Number.isFinite(Number(platformMetrics.data?.ordersToday)), "Platform order metrics failed")
  const rawOrders = await ownerClient.from("orders").select("id", { count: "exact", head: true })
  assert(!rawOrders.error && rawOrders.count === 0, "Platform directory permission exposed raw customer orders")

  const invalidTransition = await ownerClient.rpc("platform_transition_restaurant", { p_business_id: restaurantA, p_lifecycle: "ACTIVE", p_reason: "Illegal skip probe" })
  assert(invalidTransition.error?.code === "22023", "Illegal lifecycle stage skipping was accepted")
  for (const [state, reason] of [["STAGING","Configuration verified"],["CLIENT_REVIEW","Client review complete"],["READY","Activation checklist complete"],["ACTIVE","QaziPro activation approved"]]) {
    const transition = await ownerClient.rpc("platform_transition_restaurant", { p_business_id: restaurantA, p_lifecycle: state, p_reason: reason })
    if (transition.error) throw transition.error
  }
  const active = await service.from("businesses").select("is_active").eq("id", restaurantA).single()
  const audit = await service.from("platform_audit_logs").select("id", { count: "exact", head: true }).in("business_id", [restaurantA, restaurantB])
  assert(active.data?.is_active === true && Number(audit.count) >= 7, `Lifecycle activation or audit evidence failed (active=${active.data?.is_active}, audited=${audit.count})`)
  console.log(`SUPER_ADMIN_STAGING_ACCEPTANCE=PASS assertions=${assertions} restaurants=2 branches=4`)
} finally {
  await cleanup()
}
