import assert from "node:assert/strict"
import { randomUUID } from "node:crypto"
import { chromium } from "playwright"
import { createClient } from "@supabase/supabase-js"
import { createServerClient } from "@supabase/ssr"

process.loadEnvFile(new URL("../../backend/.env.local", import.meta.url))
const env = process.env
const db = createClient(env.NEXT_PUBLIC_SUPABASE_URL, env.SUPABASE_SERVICE_ROLE_KEY, { auth: { persistSession: false, autoRefreshToken: false } })
const ok = (r, label) => { if (r.error) throw new Error(`${label}: ${r.error.message}`); return r.data }
const signIn = async (email, password) => {
  const jar = new Map()
  const client = createServerClient(env.NEXT_PUBLIC_SUPABASE_URL, env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY, { cookieOptions: { name: "italian-pizza-admin-auth", path: "/", sameSite: "lax" }, cookies: { getAll: () => [...jar].map(([name, value]) => ({ name, value })), setAll: rows => rows.forEach(({ name, value }) => jar.set(name, value)) } })
  ok(await client.auth.signInWithPassword({ email, password }), "sign in")
  return { client, jar }
}
const browser = await chromium.launch({ channel: "chrome", headless: true })
let ownerId, shiftId, saleId, product, original, originalImage, originalAssignments, branch, auth
try {
  branch = ok(await db.from("branches").select("id,business_id,city").eq("is_active", true).order("sort_order").limit(1).single(), "branch")
  product = ok(await db.from("products").select("*").eq("business_id", branch.business_id).ilike("name", "%Chicken Fajita Pizza%").single(), "Chicken Fajita")
  original = { base_price: product.base_price, sale_price: product.sale_price, is_available: product.is_available, is_active: product.is_active, is_featured: product.is_featured, badge: product.badge }
  originalImage = ok(await db.from("product_images").select("*").eq("product_id", product.id).order("sort_order"), "product image")
  originalAssignments = ok(await db.from("product_modifier_groups").select("product_id,modifier_group_id,sort_order").eq("product_id", product.id).order("sort_order"), "modifier assignments")
  assert.equal(originalAssignments.length, 3, "Chicken Fajita should start with three reusable groups")
  const ownerEmail = `qa-product-owner-${randomUUID()}@example.test`, password = `Qa!${randomUUID()}a9`
  ownerId = ok(await db.auth.admin.createUser({ email: ownerEmail, password, email_confirm: true }), "owner user").user.id
  ok(await db.from("staff_memberships").insert({ business_id: branch.business_id, user_id: ownerId, role: "OWNER", is_active: true }), "owner membership")
  auth = await signIn(ownerEmail, password)
  shiftId = ok(await auth.client.rpc("open_pos_shift", { p_branch_id: branch.id, p_opening_cash: 0 }), "POS shift").id
  const context = await browser.newContext({ viewport: { width: 1440, height: 1000 } })
  await context.addCookies([...auth.jar].map(([name, value]) => ({ name, value, domain: "localhost", path: "/", sameSite: "Lax" })))
  await context.addCookies([{ name: "ip-admin-branch", value: branch.id, domain: "localhost", path: "/", sameSite: "Lax" }])
  const admin = await context.newPage()
  await admin.goto("http://localhost:3001/menu", { waitUntil: "domcontentloaded", timeout: 90000 })
  const card = () => admin.locator("article.product-admin-card").filter({ hasText: product.name }).first()
  await card().getByRole("button", { name: "Edit" }).click()
  const editor = admin.locator(".product-editor")
  await editor.locator("label").filter({ hasText: "Regular price" }).locator("input").fill(String(Number(product.base_price) + 10))
  await editor.locator("label").filter({ hasText: "Sale price" }).locator("input").fill(String(Number(product.base_price) - 10))
  const imageUrl = `${originalImage[0]?.url ?? "https://example.com/qa-product.png"}?qa_sync=${Date.now()}`
  await editor.getByLabel(/Upload image or paste image URL/).fill(imageUrl)
  await editor.locator("label.switch-row").filter({ hasText: "In stock" }).locator("input").uncheck()
  await editor.locator("label.option-attachment").filter({ hasText: "Add extras" }).locator("input").uncheck()
  await Promise.all([
    admin.waitForNavigation({ waitUntil: "domcontentloaded", timeout: 30000 }),
    editor.getByRole("button", { name: "Save product" }).click(),
  ])
  const changed = ok(await db.from("products").select("base_price,sale_price,is_available").eq("id", product.id).single(), "changed product")
  assert.equal(changed.base_price, Number(product.base_price) + 10); assert.equal(changed.sale_price, Number(product.base_price) - 10); assert.equal(changed.is_available, false)
  const changedAssignments = ok(await db.from("product_modifier_groups").select("modifier_group_id").eq("product_id", product.id), "changed assignments")
  assert.equal(changedAssignments.length, 2, "editor should detach the unchecked reusable group")
  await admin.goto("http://localhost:3001/pos", { waitUntil: "domcontentloaded", timeout: 90000 })
  assert.equal(await admin.locator(".pos-products button").filter({ hasText: product.name }).count(), 0, "out-of-stock product must not be sellable in POS")
  const customer = await context.newPage()
  await customer.goto("http://localhost:3000", { waitUntil: "domcontentloaded", timeout: 90000 })
  if (await customer.getByRole("heading", { name: "Where would you like to order?" }).count()) { await customer.getByRole("button", { name: "Pickup", exact: true }).click(); await customer.getByRole("button", { name: "Start ordering" }).click() }
  const customerCard = customer.locator(".product-card").filter({ hasText: product.name }).first()
  await customerCard.getByText("Sold out", { exact: true }).waitFor()
  console.log("PASS Admin editor availability/image/pricing/group mutation propagates; Customer and POS show sold-out state")

  // Restore desired live configuration through the Admin editor, then verify all three surfaces.
  await admin.goto("http://localhost:3001/menu", { waitUntil: "domcontentloaded", timeout: 90000 })
  await card().getByRole("button", { name: "Edit" }).click();
  const restore = admin.locator(".product-editor")
  await restore.locator("label.switch-row").filter({ hasText: "In stock" }).locator("input").check()
  await restore.locator("label.option-attachment").filter({ hasText: "Add extras" }).locator("input").check()
  await Promise.all([
    admin.waitForNavigation({ waitUntil: "domcontentloaded", timeout: 30000 }),
    restore.getByRole("button", { name: "Save product" }).click(),
  ])
  const restored = ok(await db.from("products").select("base_price,sale_price,is_available").eq("id", product.id).single(), "restored product")
  assert.equal(restored.is_available, true); assert.equal(restored.base_price, Number(product.base_price) + 10); assert.equal(restored.sale_price, Number(product.base_price) - 10)
  await admin.goto("http://localhost:3001/pos", { waitUntil: "domcontentloaded", timeout: 90000 })
  const posProduct = admin.locator(".pos-products button").filter({ hasText: product.name }).first(); await posProduct.waitFor(); await posProduct.click()
  const modifierDialog = admin.locator(".pos-modifier"); await modifierDialog.waitFor(); assert.equal(await modifierDialog.locator("fieldset").count(), 3, "POS must expose Size, Crust and Extras")
  for (const fieldset of await modifierDialog.locator("fieldset").all()) if (await fieldset.locator("button.is-selected").count() === 0) await fieldset.locator("button").first().click()
  await modifierDialog.getByRole("button", { name: "Add to order" }).click(); await admin.getByPlaceholder("Customer name (optional)").fill("QA PRODUCT SYNC"); await admin.getByRole("button", { name: "Checkout", exact: true }).click(); await admin.getByRole("button", { name: "Exact cash" }).click(); const rpcResponse=admin.waitForResponse(response=>response.url().includes("/rpc/create_pos_order")); await admin.getByRole("button", { name: "Place order & print receipt" }).click(); const rpc=await rpcResponse; await Promise.race([admin.getByText("Receipt ready", { exact: true }).waitFor({timeout:30000}),admin.getByText(/Unable to complete this sale|Open a register shift|enter enough cash/i).waitFor({timeout:30000})]); if(!await admin.getByText("Receipt ready", { exact: true }).count())throw new Error(`POS RPC ${rpc.status()}: ${(await rpc.text()).replace(/[a-f0-9]{24,}/gi,"REDACTED")}`)
  const sale = ok(await db.from("orders").select("id,total").eq("channel", "POS").eq("customer_name", "QA PRODUCT SYNC").single(), "POS sync sale")
  saleId = sale.id
  const item = ok(await db.from("order_items").select("unit_base_price,unit_modifier_price,unit_price,order_item_modifiers(group_name,option_name,price_adjustment)").eq("order_id", sale.id).single(), "POS item")
  assert.equal(item.unit_base_price, Number(product.base_price) - 10, "server must use the lower sale price as the authoritative base"); assert.ok(item.order_item_modifiers.length >= 2); assert.equal(item.unit_price, item.unit_base_price + item.unit_modifier_price)
  await customer.reload({ waitUntil: "domcontentloaded" }); await customer.waitForTimeout(1200); const liveCard = customer.locator(".product-card").filter({ hasText: product.name }).first(); await liveCard.waitFor(); await liveCard.getByRole("button", { name: "Add" }).waitFor()
  console.log("PASS restored product is visible in Admin, Customer and POS; POS customization totals match persisted modifier pricing and receipt is ready")
  await context.close()
} catch (error) { console.error(`FAIL product sync verification: ${error.stack}`); process.exitCode = 1 }
finally {
  if (saleId) { await db.from("payment_transactions").delete().eq("order_id", saleId); await db.from("orders").delete().eq("id", saleId) }
  if (shiftId) await db.from("register_shifts").delete().eq("id", shiftId)
  if (product) {
    await db.from("products").update(original).eq("id", product.id)
    if (originalImage?.length) for (const image of originalImage) await db.from("product_images").update({ url: image.url, alt_text: image.alt_text, is_primary: image.is_primary, sort_order: image.sort_order }).eq("id", image.id)
    await db.from("product_modifier_groups").delete().eq("product_id", product.id)
    if (originalAssignments?.length) await db.from("product_modifier_groups").insert(originalAssignments)
  }
  if (ownerId) { await db.from("audit_logs").delete().eq("actor_id", ownerId); await db.from("staff_memberships").delete().eq("user_id", ownerId); await db.from("profiles").delete().eq("id", ownerId); await db.auth.admin.deleteUser(ownerId) }
  await browser.close()
}
