import { createClient } from "@supabase/supabase-js"

const url = process.env.STAGING_SUPABASE_URL?.trim()
const serviceKey = process.env.STAGING_SUPABASE_SERVICE_ROLE_KEY?.trim()
const qaPassword = process.env.STAGING_QA_PASSWORD?.trim()

if (!url || !serviceKey || !qaPassword || qaPassword.length < 16) {
  throw new Error("STAGING_SUPABASE_URL, STAGING_SUPABASE_SERVICE_ROLE_KEY and a 16+ character STAGING_QA_PASSWORD are required.")
}

if (!/staging/i.test(process.env.STAGING_ENVIRONMENT ?? "")) {
  throw new Error("Refusing to seed without STAGING_ENVIRONMENT=staging.")
}

const supabase = createClient(url, serviceKey, { auth: { persistSession: false, autoRefreshToken: false } })
const ids = {
  businessA: "a0000000-0000-4000-8000-000000000001",
  businessB: "b0000000-0000-4000-8000-000000000001",
  branchA1: "a0000000-0000-4000-8000-000000000101",
  branchA2: "a0000000-0000-4000-8000-000000000102",
  branchB1: "b0000000-0000-4000-8000-000000000101",
  branchB2: "b0000000-0000-4000-8000-000000000102",
  categoryA: "a0000000-0000-4000-8000-000000000201",
  categoryB: "b0000000-0000-4000-8000-000000000201",
  productA: "a0000000-0000-4000-8000-000000000301",
  productB: "b0000000-0000-4000-8000-000000000301",
  dealA: "a0000000-0000-4000-8000-000000000302",
  variantA: "a0000000-0000-4000-8000-000000000401",
  variantB: "b0000000-0000-4000-8000-000000000401",
  modifierGroupA: "a0000000-0000-4000-8000-000000000501",
  modifierOptionA: "a0000000-0000-4000-8000-000000000601",
  modifierAssignmentA: "a0000000-0000-4000-8000-000000000701",
  areaA1: "a0000000-0000-4000-8000-000000000801",
  sectionA: "a0000000-0000-4000-8000-000000000901",
  sectionB: "b0000000-0000-4000-8000-000000000901",
  ingredientA1: "a0000000-0000-4000-8000-000000000a01",
  ingredientA2: "a0000000-0000-4000-8000-000000000a02",
}

async function upsert(table, rows, onConflict) {
  const { error } = await supabase.from(table).upsert(rows, { onConflict })
  if (error) throw new Error(`${table}: ${error.message}`)
}

await upsert("businesses", [
  { id: ids.businessA, slug: "qa-restaurant-a", name: "STAGING QA Restaurant A", short_description: "Staging isolation fixture A", city: "Islamabad", phone: "+92510000001", email: "restaurant-a@staging.qazipro.invalid", is_active: true },
  { id: ids.businessB, slug: "qa-restaurant-b", name: "STAGING QA Restaurant B", short_description: "Staging isolation fixture B", city: "Lahore", phone: "+92420000002", email: "restaurant-b@staging.qazipro.invalid", is_active: true },
], "id")

await upsert("business_domains", [
  { business_id: ids.businessA, hostname: "restaurant-a.staging.qazipro.com", domain_type: "CUSTOM", is_primary: true, is_active: true, verified_at: new Date().toISOString() },
  { business_id: ids.businessB, hostname: "restaurant-b.staging.qazipro.com", domain_type: "CUSTOM", is_primary: true, is_active: true, verified_at: new Date().toISOString() },
  { business_id: ids.businessA, hostname: "qazipro-restaurant-a-staging.vercel.app", domain_type: "SUBDOMAIN", is_primary: false, is_active: true, verified_at: new Date().toISOString() },
  { business_id: ids.businessB, hostname: "qazipro-restaurant-b-staging.vercel.app", domain_type: "SUBDOMAIN", is_primary: false, is_active: true, verified_at: new Date().toISOString() },
  { business_id: ids.businessA, hostname: "qazipro-unverified-staging.vercel.app", domain_type: "SUBDOMAIN", is_primary: false, is_active: true, verified_at: null },
  { business_id: ids.businessA, hostname: "unverified.staging.invalid", domain_type: "CUSTOM", is_primary: false, is_active: true, verified_at: null },
], "hostname")

await upsert("business_branding", [
  { business_id: ids.businessA, display_name: "STAGING QA A", primary_color: "#A92114", secondary_color: "#E7A81A", footer_description: "QA environment only" },
  { business_id: ids.businessB, display_name: "STAGING QA B", primary_color: "#174EA6", secondary_color: "#34A853", footer_description: "QA environment only" },
], "business_id")

await upsert("site_settings", [
  { business_id: ids.businessA, announcement_enabled: true, announcement_text: "STAGING QA — NO REAL ORDERS", reviews_enabled: false, tagline: "Restaurant A staging fixture" },
  { business_id: ids.businessB, announcement_enabled: true, announcement_text: "STAGING QA — NO REAL ORDERS", reviews_enabled: false, tagline: "Restaurant B staging fixture" },
], "business_id")

await upsert("branches", [
  { id: ids.branchA1, business_id: ids.businessA, code: "A1", slug: "a1", name: "STAGING QA A1", restaurant_name: "STAGING QA Restaurant A — A1", address: "Blue Area QA, Islamabad", formatted_address: "Blue Area QA, Islamabad, Pakistan", city: "Islamabad", country_code: "pk", timezone: "Asia/Karachi", latitude: 33.7077, longitude: 73.0498, pickup_enabled: true, delivery_enabled: true, online_ordering_enabled: true, is_active: true, sort_order: 1 },
  { id: ids.branchA2, business_id: ids.businessA, code: "A2", slug: "a2", name: "STAGING QA A2", restaurant_name: "STAGING QA Restaurant A — A2", address: "Saddar QA, Rawalpindi", formatted_address: "Saddar QA, Rawalpindi, Pakistan", city: "Rawalpindi", country_code: "pk", timezone: "Asia/Karachi", latitude: 33.5950, longitude: 73.0520, pickup_enabled: true, delivery_enabled: true, online_ordering_enabled: true, is_active: true, sort_order: 2 },
  { id: ids.branchB1, business_id: ids.businessB, code: "B1", slug: "b1", name: "STAGING QA B1", restaurant_name: "STAGING QA Restaurant B — B1", address: "Gulberg QA, Lahore", formatted_address: "Gulberg QA, Lahore, Pakistan", city: "Lahore", country_code: "pk", timezone: "Asia/Karachi", latitude: 31.5204, longitude: 74.3587, pickup_enabled: true, delivery_enabled: true, online_ordering_enabled: true, is_active: true, sort_order: 1 },
  { id: ids.branchB2, business_id: ids.businessB, code: "B2", slug: "b2", name: "STAGING QA B2", restaurant_name: "STAGING QA Restaurant B — B2", address: "DHA QA, Lahore", formatted_address: "DHA QA, Lahore, Pakistan", city: "Lahore", country_code: "pk", timezone: "Asia/Karachi", latitude: 31.4697, longitude: 74.4111, pickup_enabled: true, delivery_enabled: true, online_ordering_enabled: true, is_active: true, sort_order: 2 },
], "id")

await upsert("business_hours", [ids.branchA1, ids.branchA2, ids.branchB1, ids.branchB2].flatMap((branch_id) =>
  Array.from({ length: 7 }, (_, day_of_week) => ({ branch_id, day_of_week, opens_at: "00:00:00", closes_at: "23:59:59", is_closed: false })),
), "branch_id,day_of_week")

await upsert("business_operating_settings", [
  { business_id: ids.businessA, tax_rate_bps: 1000 },
  { business_id: ids.businessB, tax_rate_bps: 0 },
], "business_id")

await upsert("print_settings", [
  { business_id: ids.businessA, receipt_width_mm: 80, auto_print_receipt: false, print_kitchen_ticket: true, show_prices_on_kitchen_ticket: false, receipt_footer: "STAGING QA A receipt", copies: 1 },
  { business_id: ids.businessB, receipt_width_mm: 80, auto_print_receipt: false, print_kitchen_ticket: true, show_prices_on_kitchen_ticket: false, receipt_footer: "STAGING QA B receipt", copies: 1 },
], "business_id")

await upsert("delivery_rules", [
  { branch_id: ids.branchA1, free_distance_km: 0, extra_km_rate: 100, maximum_distance_km: 20, origin_latitude: 33.7077, origin_longitude: 73.0498, origin_address: "Blue Area QA, Islamabad" },
  { branch_id: ids.branchA2, free_distance_km: 0, extra_km_rate: 120, maximum_distance_km: 20, origin_latitude: 33.5950, origin_longitude: 73.0520, origin_address: "Saddar QA, Rawalpindi" },
  { branch_id: ids.branchB1, free_distance_km: 0, extra_km_rate: 80, maximum_distance_km: 20, origin_latitude: 31.5204, origin_longitude: 74.3587, origin_address: "Gulberg QA, Lahore" },
  { branch_id: ids.branchB2, free_distance_km: 0, extra_km_rate: 90, maximum_distance_km: 20, origin_latitude: 31.4697, origin_longitude: 74.4111, origin_address: "DHA QA, Lahore" },
], "branch_id")

await upsert("delivery_areas", [
  { id: ids.areaA1, branch_id: ids.branchA1, slug: "qa-blue-area", name: "STAGING QA Blue Area", group_name: "Nearby", city: "Islamabad", country_code: "pk", level: "CUSTOM_ZONE", boundary_type: "RADIUS", center_lat: 33.7077, center_lng: 73.0498, service_radius_meters: 20000, is_active: true },
], "id")

await upsert("pos_sections", [
  { id: ids.sectionA, business_id: ids.businessA, name: "STAGING QA Kitchen A", description: "QA sales section", color: "#A92114", sort_order: 1, is_active: true },
  { id: ids.sectionB, business_id: ids.businessB, name: "STAGING QA Kitchen B", description: "QA sales section", color: "#174EA6", sort_order: 1, is_active: true },
], "id")

await upsert("categories", [
  { id: ids.categoryA, business_id: ids.businessA, slug: "qa-food", name: "STAGING QA Food", description: "QA products only", is_active: true, sort_order: 1 },
  { id: ids.categoryB, business_id: ids.businessB, slug: "qa-food", name: "STAGING QA Food", description: "QA products only", is_active: true, sort_order: 1 },
], "id")

await upsert("products", [
  { id: ids.productA, business_id: ids.businessA, category_id: ids.categoryA, pos_section_id: ids.sectionA, slug: "qa-meal-a", sku: "QA-A-MEAL", name: "STAGING QA Meal A", description: "Variant and modifier fixture", base_price: 1000, is_available: true, is_active: true, sort_order: 1 },
  { id: ids.productB, business_id: ids.businessB, category_id: ids.categoryB, pos_section_id: ids.sectionB, slug: "qa-meal-b", sku: "QA-B-MEAL", name: "STAGING QA Meal B", description: "Tenant isolation fixture", base_price: 500, is_available: true, is_active: true, sort_order: 1 },
], "id")

await upsert("deals", [
  { id: ids.dealA, business_id: ids.businessA, slug: "qa-pos-deal-a", name: "STAGING QA POS Deal A", description: "Disposable POS regression fixture", deal_price: 1000, is_active: true, sort_order: 1 },
], "id")

await upsert("product_variants", [
  { id: ids.variantA, product_id: ids.productA, name: "STAGING QA Large", sku: "QA-A-LARGE", price_adjustment: 200, is_default: true, is_active: true },
  { id: ids.variantB, product_id: ids.productB, name: "STAGING QA Large", sku: "QA-B-LARGE", price_adjustment: 50, is_default: true, is_active: true },
], "id")

await upsert("modifier_groups", [{ id: ids.modifierGroupA, business_id: ids.businessA, name: "STAGING QA Extras", selection_type: "MULTIPLE", is_required: false, min_selections: 0, max_selections: 2, is_active: true }], "id")
await upsert("modifier_options", [{ id: ids.modifierOptionA, modifier_group_id: ids.modifierGroupA, name: "STAGING QA Cheese", price_adjustment: 100, is_default: false, is_active: true }], "id")
await upsert("product_modifier_groups", [{ id: ids.modifierAssignmentA, product_id: ids.productA, modifier_group_id: ids.modifierGroupA, sort_order: 1 }], "id")

await upsert("branch_product_overrides", [
  { business_id: ids.businessA, branch_id: ids.branchA1, product_id: ids.productA, price_override: 1100, is_available: true, pos_visible: true, online_visible: true, stock_available: true, sort_order: 1 },
  { business_id: ids.businessA, branch_id: ids.branchA2, product_id: ids.productA, price_override: null, is_available: true, pos_visible: true, online_visible: true, stock_available: true, sort_order: 1 },
  { business_id: ids.businessB, branch_id: ids.branchB1, product_id: ids.productB, price_override: null, is_available: true, pos_visible: true, online_visible: true, stock_available: true, sort_order: 1 },
], "branch_id,product_id")

await upsert("promotions", [
  { business_id: ids.businessA, code: "STAGING10", discount_type: "PERCENT", discount_value: 10, maximum_discount: 500, is_active: true },
  { business_id: ids.businessB, code: "STAGING50", discount_type: "FIXED", discount_value: 50, maximum_discount: null, is_active: true },
], "business_id,code")

await upsert("ingredients", [
  { id: ids.ingredientA1, business_id: ids.businessA, branch_id: ids.branchA1, name: "STAGING QA Cheese A1", sku: "QA-CHEESE-A1", unit: "g", current_stock: 10000, minimum_stock: 1000, cost_per_unit: 2, is_active: true },
  { id: ids.ingredientA2, business_id: ids.businessA, branch_id: ids.branchA2, name: "STAGING QA Cheese A2", sku: "QA-CHEESE-A2", unit: "g", current_stock: 8000, minimum_stock: 1000, cost_per_unit: 2, is_active: true },
], "id")

const qaUsers = [
  { email: "a-owner@staging.qazipro.invalid", business: ids.businessA, role: "OWNER", branches: [] },
  { email: "a1-staff@staging.qazipro.invalid", business: ids.businessA, role: "STAFF", branches: [ids.branchA1] },
  { email: "a-multi@staging.qazipro.invalid", business: ids.businessA, role: "MANAGER", branches: [ids.branchA1, ids.branchA2] },
  { email: "b-owner@staging.qazipro.invalid", business: ids.businessB, role: "OWNER", branches: [] },
  { email: "b1-staff@staging.qazipro.invalid", business: ids.businessB, role: "STAFF", branches: [ids.branchB1] },
]

const { data: listed, error: listError } = await supabase.auth.admin.listUsers({ page: 1, perPage: 1000 })
if (listError) throw listError

for (const fixture of qaUsers) {
  let user = listed.users.find((candidate) => candidate.email?.toLowerCase() === fixture.email)
  if (!user) {
    const created = await supabase.auth.admin.createUser({ email: fixture.email, password: qaPassword, email_confirm: true, user_metadata: { full_name: `STAGING QA ${fixture.role}` } })
    if (created.error || !created.data.user) throw new Error(`auth ${fixture.email}: ${created.error?.message ?? "not created"}`)
    user = created.data.user
  } else {
    const updated = await supabase.auth.admin.updateUserById(user.id, { password: qaPassword, email_confirm: true })
    if (updated.error) throw new Error(`auth ${fixture.email}: ${updated.error.message}`)
  }

  const membership = await supabase.from("staff_memberships").upsert({
    business_id: fixture.business,
    user_id: user.id,
    branch_id: fixture.role === "OWNER" ? null : fixture.branches[0],
    role: fixture.role,
    is_active: true,
    permissions_customized: fixture.role !== "OWNER",
  }, { onConflict: "business_id,user_id" }).select("id").single()
  if (membership.error) throw new Error(`membership ${fixture.email}: ${membership.error.message}`)
  await supabase.from("staff_membership_permissions").delete().eq("membership_id", membership.data.id)
  if (fixture.role !== "OWNER") {
    const permissionCodes = ["orders.read", "orders.manage", "pos.use", "inventory.read", "products.manage", "reports.read", "register.manage"]
    const permissions = await supabase.from("staff_membership_permissions").insert(permissionCodes.map((permission_code) => ({ membership_id: membership.data.id, permission_code })))
    if (permissions.error) throw new Error(`permissions ${fixture.email}: ${permissions.error.message}`)
  }
  await supabase.from("staff_membership_branches").delete().eq("membership_id", membership.data.id)
  if (fixture.role !== "OWNER" && fixture.branches.length) {
    const assignments = await supabase.from("staff_membership_branches").insert(fixture.branches.map((branchId) => ({ membership_id: membership.data.id, business_id: fixture.business, branch_id: branchId })))
    if (assignments.error) throw new Error(`assignments ${fixture.email}: ${assignments.error.message}`)
  }
}

console.log(JSON.stringify({ ok: true, environment: "staging", businesses: 2, branches: 4, users: qaUsers.map(({ email, role }) => ({ email, role })) }))
