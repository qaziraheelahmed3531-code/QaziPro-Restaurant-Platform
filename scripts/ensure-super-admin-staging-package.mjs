import { createClient } from "@supabase/supabase-js"

const expectedRef = "jzisqjvroxodvmqxzsob"
const ref = process.env.STAGING_SUPABASE_PROJECT_REF
const url = process.env.STAGING_SUPABASE_URL
const serviceKey = process.env.STAGING_SUPABASE_SERVICE_ROLE_KEY

if (process.env.ALLOW_STAGING_ACCEPTANCE !== "1" || process.env.STAGING_ENVIRONMENT !== "staging" || ref !== expectedRef || !url || new URL(url).hostname !== `${expectedRef}.supabase.co` || !serviceKey) {
  throw new Error("Refusing to seed a package outside the verified staging project.")
}

const client = createClient(url, serviceKey, { auth: { persistSession: false, autoRefreshToken: false } })
const packageValues = {
  code: "QAZIPRO_STANDARD",
  name: "QaziPro Standard",
  description: "Canonical staging package for approved QaziPro restaurant onboarding.",
  currency: "PKR",
  base_fee: 0,
  setup_fee: 0,
  included_branches: 1,
  additional_branch_fee: 0,
  terminal_fee: 0,
  billing_frequency: "MONTHLY",
  is_active: true,
  updated_at: new Date().toISOString(),
}
const existing = await client.from("service_packages").select("id,is_active").eq("code", packageValues.code).maybeSingle()
if (existing.error) throw new Error(`Package lookup failed: ${existing.error.message}`)
const result = existing.data
  ? await client.from("service_packages").update(packageValues).eq("id", existing.data.id).select("id").single()
  : await client.from("service_packages").insert(packageValues).select("id").single()
if (result.error || !result.data) throw new Error(`Package write failed: ${result.error?.message ?? "missing record"}`)

const capabilityKeys = ["admin.restaurant", "pos.web", "pos.desktop", "website.ordering", "ordering.pickup", "inventory", "kitchen", "reports.advanced"]
const entitlements = await client.from("package_entitlements").upsert(capabilityKeys.map((capability_key) => ({ package_id: result.data.id, capability_key, enabled: true })), { onConflict: "package_id,capability_key" })
if (entitlements.error) throw new Error(`Package entitlement write failed: ${entitlements.error.message}`)

const audit = await client.from("platform_audit_logs").insert({
  action: existing.data ? "STAGING_SERVICE_PACKAGE_REFRESHED" : "STAGING_SERVICE_PACKAGE_SEEDED",
  target_type: "service_packages",
  target_id: result.data.id,
  reason: "Verified staging onboarding catalog setup",
  after_data: { code: packageValues.code, active: true, billingFrequency: packageValues.billing_frequency, capabilities: capabilityKeys },
})
if (audit.error) throw new Error(`Package audit failed: ${audit.error.message}`)

console.log(JSON.stringify({ ok: true, code: packageValues.code, created: !existing.data, active: true, capabilityCount: capabilityKeys.length }))
