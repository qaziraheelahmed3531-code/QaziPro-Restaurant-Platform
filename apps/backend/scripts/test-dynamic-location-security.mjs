import assert from "node:assert/strict"
import { randomUUID } from "node:crypto"
import { createClient } from "../../customer/node_modules/@supabase/supabase-js/dist/index.mjs"

process.loadEnvFile(new URL("../.env.local", import.meta.url))
const url = process.env.NEXT_PUBLIC_SUPABASE_URL ?? process.env.SUPABASE_URL
const anonKey = process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY
const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY
assert.ok(url && anonKey && serviceKey, "Supabase test configuration is missing")

const service = createClient(url, serviceKey, { auth: { persistSession: false, autoRefreshToken: false } })
const publicClient = createClient(url, anonKey, { auth: { persistSession: false, autoRefreshToken: false } })
const branchId = randomUUID()
const alphaAreaId = randomUUID()
const betaAreaId = randomUUID()
const orderId = randomUUID()
let ownerId
let customerId

function checked(result, label) {
  if (result.error) throw new Error(`${label}: ${result.error.code ?? "error"} ${result.error.message ?? ""}`)
  return result.data
}

async function signInDisposable(role, businessId) {
  const email = `qa-location-${role}-${randomUUID()}@example.test`
  const password = `Qa!${randomUUID()}`
  const created = checked(await service.auth.admin.createUser({ email, password, email_confirm: true }), `${role} user`)
  if (role === "owner") checked(await service.from("staff_memberships").insert({ business_id: businessId, user_id: created.user.id, role: "OWNER", is_active: true }), "owner membership")
  const client = createClient(url, anonKey, { auth: { persistSession: false, autoRefreshToken: false } })
  checked(await client.auth.signInWithPassword({ email, password }), `${role} sign in`)
  return { id: created.user.id, client }
}

try {
  const liveBranch = checked(await service.from("branches").select("business_id,restaurant_name,city,location_revision").eq("id", "22222222-2222-4222-8222-222222222222").single(), "live branch")
  assert.equal(liveBranch.restaurant_name, "KING'S CAFE")
  assert.equal(liveBranch.city, "Islamabad")

  checked(await service.from("branches").insert({
    id: branchId,
    business_id: liveBranch.business_id,
    code: `qa-${randomUUID().slice(0, 8)}`,
    name: "QA Restaurant — Alpha City",
    restaurant_name: "QA Restaurant",
    city: "Alpha City",
    address: "Alpha address",
    formatted_address: "Alpha address",
    latitude: 33.60,
    longitude: 73.00,
    country_code: "pk",
    is_active: false,
  }), "test branch")

  checked(await service.from("delivery_areas").insert([
    { id: alphaAreaId, branch_id: branchId, slug: "qa-alpha", name: "Alpha Quarter", city: "Alpha City", group_name: "Alpha City", center_lat: 33.61, center_lng: 73.01, boundary_type: "LOCALITY_MATCH", is_active: true, is_manual: true, archived_by_city_change: false },
    { id: betaAreaId, branch_id: branchId, slug: "qa-beta", name: "Beta Quarter", city: "Beta City", group_name: "Beta City", center_lat: 31.52, center_lng: 74.35, boundary_type: "LOCALITY_MATCH", is_active: false, is_manual: true, archived_by_city_change: true },
  ]), "test areas")

  const owner = await signInDisposable("owner", liveBranch.business_id)
  ownerId = owner.id
  const save = (city, latitude, longitude) => owner.client.rpc("save_restaurant_origin", { p_branch_id: branchId, p_location: {
    restaurant_name: "QA Restaurant", city, formatted_address: `${city} address`, latitude, longitude,
    country_code: "pk", country_name: "Pakistan", region: "QA Region", provider: "geoapify",
  } })

  checked(await save("Beta City", 31.52, 74.35), "switch to beta")
  let areas = checked(await service.from("delivery_areas").select("id,is_active,archived_by_city_change").eq("branch_id", branchId), "beta areas")
  assert.deepEqual(areas.find((area) => area.id === alphaAreaId), { id: alphaAreaId, is_active: false, archived_by_city_change: true })
  assert.deepEqual(areas.find((area) => area.id === betaAreaId), { id: betaAreaId, is_active: true, archived_by_city_change: false })

  checked(await save("Alpha City", 33.60, 73.00), "switch back to alpha")
  areas = checked(await service.from("delivery_areas").select("id,is_active,archived_by_city_change").eq("branch_id", branchId), "restored areas")
  assert.deepEqual(areas.find((area) => area.id === alphaAreaId), { id: alphaAreaId, is_active: true, archived_by_city_change: false })
  assert.deepEqual(areas.find((area) => area.id === betaAreaId), { id: betaAreaId, is_active: false, archived_by_city_change: true })

  const importResult = checked(await owner.client.rpc("import_delivery_area_candidates", { p_branch_id: branchId, p_candidates: [{
    name: "Alpha Quarter", slug: "alpha-quarter", aliases: ["Provider alias"], providerPlaceId: "qa-provider-place", countryCode: "pk", latitude: 33.99, longitude: 73.99,
  }] }), "manual preservation import")
  assert.equal(importResult.importedCount, 0)
  assert.equal(importResult.skippedCount, 1)
  const manual = checked(await service.from("delivery_areas").select("name,is_manual,provider_place_id,center_lat,center_lng").eq("id", alphaAreaId).single(), "manual area")
  assert.equal(manual.is_manual, true)
  assert.equal(manual.provider_place_id, null)
  assert.equal(Number(manual.center_lat), 33.61)

  const customer = await signInDisposable("customer", liveBranch.business_id)
  customerId = customer.id
  const branchMutation = await customer.client.from("branches").update({ city: "Forbidden" }).eq("id", branchId).select("id")
  assert.equal(branchMutation.error, null)
  assert.deepEqual(branchMutation.data, [])
  const areaMutation = await customer.client.from("delivery_areas").update({ name: "Forbidden" }).eq("id", alphaAreaId).select("id")
  assert.equal(areaMutation.error, null)
  assert.deepEqual(areaMutation.data, [])
  const inactivePublic = checked(await publicClient.from("delivery_areas").select("id").eq("id", betaAreaId), "public inactive area")
  assert.deepEqual(inactivePublic, [])

  const orderNumber = `QA-SNAPSHOT-${randomUUID()}`
  checked(await service.from("orders").insert({ id: orderId, order_number: orderNumber, business_id: liveBranch.business_id, branch_id: branchId, service_mode: "PICKUP", customer_name: "QA Customer", customer_phone: "03000000000", subtotal: 100, total: 100 }), "snapshot order")
  const initialOrder = checked(await service.from("orders").select("location_snapshot").eq("id", orderId).single(), "initial snapshot")
  assert.equal(initialOrder.location_snapshot.restaurantName, "QA Restaurant")
  assert.equal(initialOrder.location_snapshot.branchCity, "Alpha City")
  checked(await save("Beta City", 31.52, 74.35), "snapshot identity change")
  const unchangedOrder = checked(await service.from("orders").select("location_snapshot").eq("id", orderId).single(), "unchanged snapshot")
  assert.deepEqual(unchangedOrder.location_snapshot, initialOrder.location_snapshot)

  const activeIslamabad = checked(await publicClient.from("delivery_areas").select("id,city,is_active").eq("branch_id", "22222222-2222-4222-8222-222222222222"), "public live areas")
  assert.ok(activeIslamabad.length >= 50)
  assert.ok(activeIslamabad.every((area) => area.is_active && area.city === "Islamabad"))
  const historicalResult = await service.from("orders").select("id", { count: "exact", head: true }).is("location_snapshot", null)
  if (historicalResult.error) throw new Error(`historical snapshots: ${historicalResult.error.code ?? historicalResult.error.message}`)

  console.log(JSON.stringify({
    atomicSwitch: "PASS",
    switchBackRestore: "PASS",
    manualAreaPreservation: "PASS",
    unauthorizedBranchMutation: "DENIED",
    unauthorizedAreaMutation: "DENIED",
    inactivePublicRead: "DENIED",
    activeIslamabadAreas: activeIslamabad.length,
    immutableOrderSnapshot: "PASS",
    historicalOrdersLeftUnchanged: historicalResult.count ?? 0,
  }))
} finally {
  await service.from("orders").delete().eq("id", orderId)
  await service.from("branches").delete().eq("id", branchId)
  if (ownerId) await service.auth.admin.deleteUser(ownerId)
  if (customerId) await service.auth.admin.deleteUser(customerId)
}
