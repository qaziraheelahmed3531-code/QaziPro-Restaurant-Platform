// Read-only public staging acceptance. All browser mutations are intercepted.
import assert from "node:assert/strict"
import { chromium, expect } from "playwright/test"
const hosts = ["italian-pizza.staging.qazipro.com", "kings-cafe.staging.qazipro.com"]
const browser = await chromium.launch({ channel: "chrome", headless: true })
let passed = 0
const pass = label => { passed++; console.log(`PASS ${label}`) }
try {
  for (const [index, host] of [...hosts, ...hosts].entries()) {
    const context = await browser.newContext({ viewport: { width: index < 2 ? 390 : 1440, height: 960 } })
    const page = await context.newPage()
    const errors = []
    page.on("pageerror", error => errors.push(error.message))
    await page.route("**/*", route => ["GET", "HEAD"].includes(route.request().method()) ? route.continue() : route.abort("blockedbyclient"))
    await page.goto(`https://${host}`, { waitUntil: "domcontentloaded", timeout: 60000 })
    const expected = host.startsWith("italian") ? /Italian Pizza/i : /Kings Cafe/i
    await expect(page.getByRole("heading", { level: 1 }).first()).toHaveText(expected)
    assert.ok(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth))
    pass(`${host} ${index < 2 ? "mobile" : "desktop"}: correct restaurant identity, no horizontal overflow`)
    const location = page.getByRole("dialog", { name: "Where would you like to order?" })
    await expect(location).toBeVisible({ timeout: 30000 })
    {
      await location.getByRole("button", { name: "Pickup", exact: true }).click()
      await location.getByRole("button", { name: "Start ordering", exact: true }).click()
      await expect(location).not.toBeVisible()
    }
    assert.equal(await page.locator(".restaurant-intro").count(), 0)
    assert.equal(await page.getByRole("link", { name: "Explore the menu" }).count(), 0)
    const layout = await page.evaluate(() => {
      const hero = document.querySelector(".hero-carousel")
      const header = document.querySelector(".site-header")
      const menu = document.querySelector("#menu")
      const ids = [...document.querySelectorAll(".product-card[data-product-id]")].map(node => node.dataset.productId)
      return {
        duplicateProducts: ids.length !== new Set(ids).size,
        hero: hero && header && menu ? {
          headerGap: hero.getBoundingClientRect().top - header.getBoundingClientRect().bottom,
          menuGap: menu.getBoundingClientRect().top - hero.getBoundingClientRect().bottom,
          imageFit: getComputedStyle(hero.querySelector("img")).objectFit,
        } : null,
      }
    })
    assert.equal(layout.duplicateProducts, false)
    if (layout.hero) {
      assert.ok(Math.abs(layout.hero.headerGap) <= 1, "Header and hero meet without a gap")
      assert.equal(layout.hero.menuGap, 0)
      assert.equal(layout.hero.imageFit, "cover")
      pass(`${host}: removed intro, gap-free hero, single responsive product tree`)
    }
    const product = page.getByRole("button", { name: /^View .+ details$/ }).first()
    if (await product.count()) {
      await product.click()
      const detail = page.locator("dialog.customization-dialog[open]")
      await expect(detail).toBeVisible()
      await detail.getByRole("button", { name: /^Add to Cart/ }).click()
      const cart = page.getByRole("dialog", { name: "Your Cart", exact: true })
      await expect(cart).toBeVisible()
      await cart.getByRole("button", { name: "Increase quantity" }).first().click()
      await expect(cart.locator(".quantity-control output").first()).toHaveText("2")
      await page.keyboard.press("Escape")
      await expect(cart).not.toBeVisible()
      pass(`${host}: public product → cart → quantity → Escape`)
    } else console.log(`NOT TESTED ${host}: no available product fixture`)
    const reviews = await context.request.get(`https://${host}/api/google-reviews`)
    assert.equal(reviews.status(), 200)
    const payload = await reviews.json()
    assert.doesNotMatch(JSON.stringify(payload), /AMS ISLAMIC/)
    assert.equal(reviews.headers()["cache-control"], "private, no-store")
    assert.deepEqual(errors, [])
    pass(`${host}: tenant-safe reviews response and no browser runtime exceptions`)
    await context.close()
  }
  const context = await browser.newContext()
  const page = await context.newPage()
  await page.goto("https://random-not-real.staging.qazipro.com", { waitUntil: "domcontentloaded", timeout: 60000 })
  await expect(page.getByRole("heading", { name: /Store unavailable|Restaurant.*(unavailable|not found)/i })).toBeVisible()
  const reviews = await context.request.get("https://random-not-real.staging.qazipro.com/api/google-reviews")
  assert.equal(reviews.status(), 404)
  pass("unknown public hostname fails closed, including reviews API")
  await page.goto("https://admin.staging.qazipro.com/login", { waitUntil: "domcontentloaded", timeout: 60000 })
  await expect(page.getByRole("button", { name: /Continue with Google/i })).toBeVisible()
  assert.equal(await page.locator('input[type="password"]').count(), 0)
  pass("public Admin login exposes Google/OTP, no primary password field")
  await context.close()
  console.log(`${passed} public HTTPS checks passed. No auth, email, order or campaign submission performed.`)
} finally { await browser.close() }
