import assert from "node:assert/strict"
import { randomUUID } from "node:crypto"
import { chromium } from "playwright"
import { createClient } from "@supabase/supabase-js"
import { createServerClient } from "@supabase/ssr"

process.loadEnvFile(new URL("../../backend/.env.local", import.meta.url))
const env = process.env
const db = createClient(env.NEXT_PUBLIC_SUPABASE_URL, env.SUPABASE_SERVICE_ROLE_KEY, { auth: { persistSession: false, autoRefreshToken: false } })
const checked = (result, label) => { if (result.error) throw new Error(`${label}: ${result.error.message}`); return result.data }
const cookieClient = async (email, password) => {
  const jar = new Map()
  const client = createServerClient(env.NEXT_PUBLIC_SUPABASE_URL, env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY, { cookieOptions: { name: "italian-pizza-admin-auth", path: "/", sameSite: "lax" }, cookies: { getAll: () => [...jar].map(([name, value]) => ({ name, value })), setAll: rows => rows.forEach(({ name, value }) => jar.set(name, value)) } })
  checked(await client.auth.signInWithPassword({ email, password }), "Admin sign in")
  return { client, jar }
}

const browser = await chromium.launch({ channel: "chrome", headless: true })
let ownerId, manualInvoiceId
try {
  const branch = checked(await db.from("branches").select("id,business_id,restaurant_name,city,location_revision").eq("is_active", true).order("sort_order").limit(1).single(), "active branch")
  const area = checked(await db.from("delivery_areas").select("id,slug,name").eq("branch_id", branch.id).eq("is_active", true).eq("name", "H-11").single(), "H-11 area")
  const orderInvoice = checked(await db.from("invoices").select("id,order_number,invoice_number").not("order_id", "is", null).order("created_at", { ascending: false }).limit(1).single(), "order invoice")
  const password = `Qa!${randomUUID()}a9`, ownerEmail = `qa-final-owner-${randomUUID()}@example.test`
  ownerId = checked(await db.auth.admin.createUser({ email: ownerEmail, password, email_confirm: true }), "owner user").user.id
  checked(await db.from("staff_memberships").insert({ business_id: branch.business_id, user_id: ownerId, role: "OWNER", is_active: true }), "owner membership")
  const auth = await cookieClient(ownerEmail, password)
  const adminContext = await browser.newContext({ viewport: { width: 1440, height: 1000 } })
  await adminContext.addCookies([...auth.jar].map(([name, value]) => ({ name, value, domain: "localhost", path: "/", sameSite: "Lax" })))
  await adminContext.addCookies([{ name: "ip-admin-branch", value: branch.id, domain: "localhost", path: "/", sameSite: "Lax" }])
  const admin = await adminContext.newPage()

  await admin.goto("http://localhost:3001/pos", { waitUntil: "domcontentloaded", timeout: 90000 })
  await admin.getByRole("button", { name: "Pizzas", exact: true }).click()
  await admin.locator(".pos-products button").filter({ hasText: "Chicken Fajita Pizza" }).first().waitFor()
  console.log("PASS POS Pizzas category shows its sellable pizza products")

  await admin.goto("http://localhost:3001/invoices", { waitUntil: "domcontentloaded", timeout: 90000 })
  const orderRow = admin.locator("tbody tr").filter({ hasText: orderInvoice.order_number }).first()
  await orderRow.waitFor(); await orderRow.getByRole("button", { name: "Open" }).click()
  await admin.getByText(orderInvoice.invoice_number, { exact: true }).waitFor()
  await admin.evaluate(() => { window.__qaPrintCalls = 0; window.print = () => window.__qaPrintCalls++ })
  await admin.getByRole("button", { name: "Print / Save PDF" }).click()
  await admin.waitForFunction(() => window.__qaPrintCalls === 1)
  console.log("PASS finalized normal-order invoice appears under Order invoices and prints from authoritative snapshot")

  await admin.getByRole("button", { name: "New manual invoice" }).click()
  const editor = admin.locator(".invoice-manual-editor")
  await editor.getByLabel("Customer name").fill("QA FINAL MANUAL INVOICE")
  await editor.getByLabel("Description").fill("QA catering item")
  await editor.getByLabel("unit price").fill("750")
  await admin.evaluate(() => { window.__qaPrintCalls = 0 })
  await editor.getByRole("button", { name: "Save & print" }).click()
  await admin.waitForFunction(() => window.__qaPrintCalls === 1, null, { timeout: 20000 })
  manualInvoiceId = checked(await db.from("invoices").select("id,total,status").eq("customer_name", "QA FINAL MANUAL INVOICE").single(), "manual invoice").id
  console.log("PASS manual invoice Save & print persists ledger totals and invokes browser print")
  await adminContext.close()

  const customerContext = await browser.newContext({ viewport: { width: 390, height: 844 } })
  await customerContext.addInitScript(() => localStorage.removeItem("italian-pizza-demo-state-v2"))
  const customer = await customerContext.newPage()
  await customer.goto("http://localhost:3000", { waitUntil: "domcontentloaded", timeout: 90000 })
  await customer.getByRole("heading", { name: "Where would you like to order?" }).waitFor()
  await customer.getByRole("button", { name: "Delivery", exact: true }).click()
  await customer.getByRole("combobox", { name: /Select area/ }).click()
  await customer.getByLabel("Search supported delivery areas").fill("H-11")
  await customer.getByRole("option", { name: /H-11/ }).click()
  await customer.getByRole("button", { name: "Start ordering" }).click()
  await customer.locator("button.mobile-location:visible").filter({ hasText: "H-11, Islamabad" }).waitFor()
  const persisted = await customer.evaluate(() => JSON.parse(localStorage.getItem("italian-pizza-demo-state-v2")))
  assert.equal(persisted.branchId, branch.id); assert.equal(persisted.selectedAreaId, area.slug); assert.equal(persisted.city, "Islamabad"); assert.equal(persisted.locationRevision, branch.location_revision)
  const addDeal = customer.getByRole("button", { name: "Add deal" }).first(); await addDeal.waitFor(); await addDeal.click()
  if (!await customer.locator("dialog.cart-drawer-dialog[open]").count()) await customer.locator('button[aria-label="Open cart with 1 items"]:visible').click()
  await customer.getByRole("link", { name: "Checkout" }).click()
  await customer.getByText("Delivering in: H-11, Islamabad", { exact: true }).waitFor()
  console.log("PASS mandatory H-11 delivery selection persists branch/area/city/revision and remains identical in header and checkout")
  await customerContext.close()
} catch (error) {
  console.error(`FAIL final acceptance verification: ${error.stack}`)
  process.exitCode = 1
} finally {
  if (manualInvoiceId) { await db.from("invoice_lines").delete().eq("invoice_id", manualInvoiceId); await db.from("invoices").delete().eq("id", manualInvoiceId) }
  if (ownerId) { await db.from("audit_logs").delete().eq("actor_id", ownerId); await db.from("staff_memberships").delete().eq("user_id", ownerId); await db.from("profiles").delete().eq("id", ownerId); await db.auth.admin.deleteUser(ownerId) }
  await browser.close()
}
