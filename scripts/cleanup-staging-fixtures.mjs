import { createClient } from "@supabase/supabase-js"

const url = process.env.STAGING_SUPABASE_URL?.trim()
const key = process.env.STAGING_SUPABASE_SERVICE_ROLE_KEY?.trim()
if (!url || !key || !/staging/i.test(process.env.STAGING_ENVIRONMENT ?? "")) throw new Error("Explicit staging credentials and STAGING_ENVIRONMENT=staging are required.")
const supabase = createClient(url, key, { auth: { persistSession: false, autoRefreshToken: false } })
const emails = new Set(["a-owner@staging.qazipro.invalid", "a1-staff@staging.qazipro.invalid", "a-multi@staging.qazipro.invalid", "b-owner@staging.qazipro.invalid", "b1-staff@staging.qazipro.invalid"])
const listed = await supabase.auth.admin.listUsers({ page: 1, perPage: 1000 })
if (listed.error) throw listed.error
const fixtureUsers = listed.data.users.filter((user) => user.email && emails.has(user.email.toLowerCase()))

async function remove(table, column, values) {
  if (!values.length) return
  const result = await supabase.from(table).delete().in(column, values)
  if (result.error) throw new Error(`${table}: ${result.error.message}`)
}

const businessIds = ["a0000000-0000-4000-8000-000000000001", "b0000000-0000-4000-8000-000000000001"]
const orders = await supabase.from("orders").select("id").in("business_id", businessIds)
if (orders.error) throw orders.error
const orderIds = (orders.data ?? []).map((row) => row.id)
const invoices = await supabase.from("invoices").select("id").in("business_id", businessIds)
if (invoices.error) throw invoices.error
const invoiceIds = (invoices.data ?? []).map((row) => row.id)

// Financial and operational history intentionally uses RESTRICT in production.
// Disposable QA teardown therefore removes the exact fixed fixture tenants'
// dependent records explicitly before deleting their parent businesses.
await remove("invoice_lines", "invoice_id", invoiceIds)
await remove("refunds", "business_id", businessIds)
await remove("payment_events", "business_id", businessIds)
await remove("payment_transactions", "business_id", businessIds)
await remove("invoices", "business_id", businessIds)
await remove("pos_order_replacements", "business_id", businessIds)
await remove("cash_movements", "business_id", businessIds)
await remove("register_shifts", "business_id", businessIds)
await remove("orders", "id", orderIds)
await remove("support_tickets", "business_id", businessIds)
await remove("restaurant_subscriptions", "business_id", businessIds)
await remove("restaurant_onboarding", "business_id", businessIds)

// Remove the tenant graph before deleting Auth identities. Deleting an owner
// identity first would activate the normal restaurant safeguard that requires
// at least one active owner. Parent deletion is the intentional QA teardown
// path and lets the database cascade all tenant-scoped fixture rows together.
for (const id of businessIds) {
  const result = await supabase.from("businesses").delete().eq("id", id)
  if (result.error) throw result.error
}
for (const user of fixtureUsers) {
  const result = await supabase.auth.admin.deleteUser(user.id)
  if (result.error) throw result.error
}
console.log(JSON.stringify({ ok: true, removed: "STAGING QA fixtures" }))
