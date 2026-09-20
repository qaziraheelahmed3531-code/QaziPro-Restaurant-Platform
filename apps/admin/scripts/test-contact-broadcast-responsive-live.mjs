import assert from "node:assert/strict"
import { randomUUID } from "node:crypto"
import { chromium } from "playwright"
import { createClient } from "@supabase/supabase-js"
import { createServerClient } from "@supabase/ssr"

process.loadEnvFile(new URL("../../backend/.env.local", import.meta.url))
const adminOrigin = process.argv[2] ?? "http://localhost:3001"
const customerOrigin = process.argv[3] ?? "http://localhost:3000"
assert.equal(new URL(adminOrigin).hostname, "localhost")
assert.equal(new URL(customerOrigin).hostname, "localhost")
const env = process.env
const service = createClient(env.NEXT_PUBLIC_SUPABASE_URL, env.SUPABASE_SERVICE_ROLE_KEY, { auth: { persistSession: false, autoRefreshToken: false } })
const publicKey = env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY
const check = (result, label) => { if (result.error) throw new Error(`${label}: ${result.error.message}`); return result.data }
const email = `qa-contact-${randomUUID()}@qazipro-testing.com`, ownerEmail = `qa-contact-owner-${randomUUID()}@example.test`
const password = `Qa!${randomUUID()}9`
let customerId, ownerId, campaignId, storagePath, browser, original

try {
  const business = check(await service.from("businesses").select("id").eq("slug", "italian-pizza").single(), "business")
  const branch = check(await service.from("branches").select("id,city,location_revision").eq("business_id", business.id).eq("is_active", true).order("sort_order").limit(1).single(), "branch")
  original = check(await service.from("site_settings").select("*").eq("business_id", business.id).single(), "settings")
  check(await service.from("site_settings").update({ whatsapp_floating_enabled: true, whatsapp_floating_number: "923001234567", whatsapp_floating_logo_url: null, whatsapp_floating_side: "LEFT", whatsapp_floating_size_px: 60, whatsapp_floating_bottom_px: 20, whatsapp_floating_side_offset_px: 16 }).eq("business_id", business.id), "enable widget")

  customerId = check(await service.auth.admin.createUser({ email, password, email_confirm: true }), "customer user").user.id
  const customer = createClient(env.NEXT_PUBLIC_SUPABASE_URL, publicKey, { auth: { persistSession: false, autoRefreshToken: false } })
  check(await customer.auth.signInWithPassword({ email, password }), "customer sign in")
  check(await customer.rpc("register_storefront_customer", { p_business_id: business.id }), "customer tenant registration")
  assert.equal(check(await service.from("storefront_customer_memberships").select("business_id,user_id").eq("business_id", business.id).eq("user_id", customerId).single(), "membership").user_id, customerId)

  ownerId = check(await service.auth.admin.createUser({ email: ownerEmail, password, email_confirm: true }), "owner user").user.id
  check(await service.from("staff_memberships").insert({ business_id: business.id, user_id: ownerId, role: "OWNER", is_active: true }), "owner membership")
  const jar = new Map()
  const owner = createServerClient(env.NEXT_PUBLIC_SUPABASE_URL, publicKey, { cookieOptions: { name: "italian-pizza-admin-auth", path: "/", sameSite: "lax" }, cookies: { getAll: () => [...jar].map(([name, value]) => ({ name, value })), setAll: (items) => items.forEach(({ name, value }) => jar.set(name, value)) } })
  check(await owner.auth.signInWithPassword({ email: ownerEmail, password }), "owner sign in")
  storagePath = `${business.id}/qa-${randomUUID()}.png`
  check(await owner.storage.from("whatsapp-assets").upload(storagePath, Buffer.from("iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNk+A8AAQUBAScY42YAAAAASUVORK5CYII=", "base64"), { contentType: "image/png" }), "WhatsApp asset upload")
  const created = check(await owner.rpc("create_customer_broadcast", { p_business_id: business.id, p_deal_id: null, p_subject: "QA private campaign", p_message: "This fixture is never handed to SMTP." }), "create broadcast")
  campaignId = created.id
  assert.ok(created.recipientCount >= 1, "tenant audience must contain the registered customer")
  const recipients = check(await service.from("customer_broadcast_deliveries").select("recipient").eq("broadcast_id", campaignId), "delivery recipients")
  assert.equal(recipients.length, created.recipientCount)
  assert.ok(recipients.some((item) => item.recipient === email), "registered customer must be in this restaurant's audience")

  browser = await chromium.launch({ channel: "chrome", headless: true })
  const customerContext = await browser.newContext({ viewport: { width: 390, height: 844 } })
  const page = await customerContext.newPage()
  const pageErrors = []; page.on("pageerror", (error) => pageErrors.push(error.message))
  await page.goto(customerOrigin, { waitUntil: "domcontentloaded", timeout: 120000 })
  const location = page.locator(".location-panel--v5")
  await location.waitFor({ state: "visible", timeout: 30000 })
  assert.equal(await location.locator(".brand-logo > strong").count(), 0, "location header must show logo without restaurant name")
  assert.equal(await location.locator(".brand-logo--location img").count(), original ? 1 : 0)
  assert.notEqual(await location.locator(".location-panel__header").evaluate((node) => getComputedStyle(node).backgroundColor), "rgba(0, 0, 0, 0)")
  assert.match(await page.locator(".location-dialog .dialog-backdrop").evaluate((node) => { const style = getComputedStyle(node); return [style.backdropFilter, style.webkitBackdropFilter].find((value) => value && value !== "none") || "" }), /blur/)
  await location.getByRole("button", { name: "Pickup" }).click()
  await location.getByRole("button", { name: "Start ordering" }).click()
  const widget = page.locator(".floating-whatsapp")
  await widget.waitFor({ state: "visible" })
  const widgetLayout = await widget.evaluate((node) => { const box = node.getBoundingClientRect(); return { left: box.left, right: box.right, width: box.width, bottom: innerHeight - box.bottom } })
  assert.equal(Math.round(widgetLayout.width), 60); assert.ok(widgetLayout.left >= 15 && widgetLayout.right <= 390)
  await page.getByRole("button", { name: /Open cart/i }).first().click()
  await page.waitForTimeout(80)
  assert.match(await page.locator(".cart-drawer-dialog .dialog-backdrop").evaluate((node) => { const style = getComputedStyle(node); return [style.backdropFilter, style.webkitBackdropFilter].find((value) => value && value !== "none") || "" }), /blur/)
  assert.notEqual(await page.locator(".cart-drawer").evaluate((node) => getComputedStyle(node).transform), "none")
  assert.deepEqual(pageErrors, [])

  const adminContext = await browser.newContext({ viewport: { width: 768, height: 1024 } })
  await adminContext.addCookies([...jar].map(([name, value]) => ({ name, value, domain: "localhost", path: "/", sameSite: "Lax" })))
  await adminContext.addCookies([{ name: "ip-admin-branch", value: branch.id, domain: "localhost", path: "/", sameSite: "Lax" }])
  const admin = await adminContext.newPage(); const adminErrors = []; admin.on("pageerror", (error) => adminErrors.push(error.message))
  await admin.goto(`${adminOrigin}/content`, { waitUntil: "domcontentloaded", timeout: 120000 })
  await admin.getByRole("heading", { name: "Floating WhatsApp button" }).waitFor({ timeout: 30000 })
  await admin.getByRole("heading", { name: "Email signed-in customers" }).waitFor()
  const editor = admin.locator(".whatsapp-editor")
  await editor.getByLabel("Side").selectOption("RIGHT")
  await editor.locator('input[type="range"]').first().fill("62")
  await editor.getByRole("button", { name: "Save & publish" }).click()
  await editor.getByText("WhatsApp button is now live on the storefront.").waitFor({ timeout: 30000 })
  const savedWidget = check(await service.from("site_settings").select("whatsapp_floating_side,whatsapp_floating_size_px").eq("business_id", business.id).single(), "saved widget")
  assert.deepEqual(savedWidget, { whatsapp_floating_side: "RIGHT", whatsapp_floating_size_px: 62 })
  assert.equal(await editor.locator(".whatsapp-preview").getAttribute("data-side"), "right")
  assert.equal(await admin.evaluate(() => document.documentElement.scrollWidth <= document.documentElement.clientWidth), true, "content settings must not overflow tablet viewport")
  for (const path of ["/waiter", "/rider"]) {
    await admin.goto(`${adminOrigin}${path}`, { waitUntil: "domcontentloaded", timeout: 120000 })
    const tabletOverflow = await admin.evaluate(() => ({ fits: document.documentElement.scrollWidth <= document.documentElement.clientWidth, viewport: document.documentElement.clientWidth, scroll: document.documentElement.scrollWidth, elements: [...document.querySelectorAll("body *")].map((node) => { const box = node.getBoundingClientRect(); return { tag: node.tagName, className: typeof node.className === "string" ? node.className : "", left: Math.round(box.left), right: Math.round(box.right), width: Math.round(box.width) } }).filter((item) => item.right > document.documentElement.clientWidth + 1).slice(0, 12) }))
    assert.equal(tabletOverflow.fits, true, `${path} must not overflow tablet viewport: ${JSON.stringify(tabletOverflow)}`)
  }
  await admin.setViewportSize({ width: 390, height: 844 })
  for (const path of ["/waiter", "/rider"]) {
    await admin.goto(`${adminOrigin}${path}`, { waitUntil: "domcontentloaded", timeout: 120000 })
    const mobileOverflow = await admin.evaluate(() => ({ fits: document.documentElement.scrollWidth <= document.documentElement.clientWidth, viewport: document.documentElement.clientWidth, scroll: document.documentElement.scrollWidth, elements: [...document.querySelectorAll("body *")].map((node) => { const box = node.getBoundingClientRect(); return { tag: node.tagName, className: typeof node.className === "string" ? node.className : "", left: Math.round(box.left), right: Math.round(box.right), width: Math.round(box.width) } }).filter((item) => item.right > document.documentElement.clientWidth + 1).slice(0, 12) }))
    assert.equal(mobileOverflow.fits, true, `${path} must not overflow mobile viewport: ${JSON.stringify(mobileOverflow)}`)
  }
  assert.deepEqual(adminErrors, [])
  console.log("PASS: WhatsApp placement, themed logo-only modal, blurred cart, tenant audience, and mobile/tablet Waiter/Rider layouts")
} finally {
  if (browser) await browser.close()
  if (storagePath) await service.storage.from("whatsapp-assets").remove([storagePath])
  if (campaignId) { await service.from("audit_logs").delete().eq("action", "CUSTOMER_BROADCAST_CREATED").eq("entity_id", campaignId); await service.from("customer_broadcasts").delete().eq("id", campaignId) }
  if (original) await service.from("site_settings").update({ whatsapp_floating_enabled: original.whatsapp_floating_enabled, whatsapp_floating_number: original.whatsapp_floating_number, whatsapp_floating_logo_url: original.whatsapp_floating_logo_url, whatsapp_floating_message: original.whatsapp_floating_message, whatsapp_floating_side: original.whatsapp_floating_side, whatsapp_floating_size_px: original.whatsapp_floating_size_px, whatsapp_floating_bottom_px: original.whatsapp_floating_bottom_px, whatsapp_floating_side_offset_px: original.whatsapp_floating_side_offset_px }).eq("business_id", original.business_id)
  if (ownerId) { await service.from("staff_memberships").delete().eq("user_id", ownerId); await service.auth.admin.deleteUser(ownerId) }
  if (customerId) await service.auth.admin.deleteUser(customerId)
}
