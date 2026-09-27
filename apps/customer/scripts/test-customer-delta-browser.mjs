import assert from "node:assert/strict"
import { mkdir } from "node:fs/promises"
import { existsSync } from "node:fs"
import { chromium } from "playwright"

const base = process.env.CUSTOMER_TEST_URL || "http://localhost:3105"
if (!/^https?:\/\/(localhost|127\.0\.0\.1)(:\d+)?$/.test(base)) throw Error("This mutation-interception suite is local-only")
const executablePath = ["C:/Program Files/Google/Chrome/Application/chrome.exe", "C:/Program Files (x86)/Google/Chrome/Application/chrome.exe"].find(existsSync)
const browser = await chromium.launch({ headless: true, ...(executablePath ? { executablePath } : {}) })
const output = new URL("../../../docs/qa/customer-delta/", import.meta.url)
await mkdir(output, { recursive: true })
let passed = 0
const pass = label => { passed++; console.log(`PASS ${label}`) }
try {
  for (const width of [360, 390, 430, 768, 1024, 1440, 1920]) {
    const context = await browser.newContext({ viewport: { width, height: 960 } })
    const page = await context.newPage()
    const errors = []
    page.on("pageerror", error => errors.push(error.message))
    // Hard stop on email/auth/order writes: never create a real acceptance order here.
    await page.route("**/*", async route => {
      const request = route.request()
      if (request.method() !== "GET" && request.method() !== "HEAD") {
        if (new URL(request.url()).pathname === "/api/promotions/validate") return route.fulfill({ status: 200, json: { valid: false, discount: 0 } })
        return route.abort("blockedbyclient")
      }
      return route.continue()
    })
    await page.goto(base, { waitUntil: "domcontentloaded" })
    const location = page.getByRole("dialog", { name: "Where would you like to order?" })
    await location.getByRole("button", { name: "Pickup", exact: true }).click()
    await location.getByRole("button", { name: "Start ordering", exact: true }).click()
    await location.waitFor({ state: "hidden" })
    await page.getByRole("heading", { level: 1 }).waitFor()
    assert.equal(await page.locator(".restaurant-intro").count(), 0, "Removed intro must not return")
    assert.equal(await page.getByRole("link", { name: "Explore the menu" }).count(), 0)
    const spacing = await page.evaluate(() => {
      const hero = document.querySelector(".hero-carousel")
      const menu = document.querySelector("#menu")
      return hero && menu ? {
        topMargin: getComputedStyle(hero).marginTop,
        menuGap: menu.getBoundingClientRect().top - hero.getBoundingClientRect().bottom,
        imageFit: getComputedStyle(hero.querySelector("img")).objectFit,
      } : null
    })
    assert.deepEqual(spacing, { topMargin: "0px", menuGap: 0, imageFit: "cover" })
    const productIds = await page.locator(".product-card[data-product-id]").evaluateAll(nodes => nodes.map(node => node.getAttribute("data-product-id")))
    assert.equal(productIds.length, new Set(productIds).size, "One responsive product tree, not duplicated desktop/mobile cards")
    assert.ok(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth), `No horizontal overflow at ${width}`)
    pass(`${width}px menu and restaurant identity, no overflow`)
    await page.screenshot({ path: new URL(`menu-${width}.png`, output).pathname.replace(/^\/(\w:)/, "$1") })
    const product = page.getByRole("button", { name: /^View .+ details$/ }).first()
    await product.click()
    const details = page.locator("dialog.customization-dialog[open]")
    await details.getByRole("heading", { level: 2 }).waitFor()
    assert.ok(await details.evaluate(node => node.contains(document.activeElement)), "Product dialog traps initial focus")
    await details.getByRole("button", { name: /^Add to Cart/ }).click()
    const cart = page.getByRole("dialog", { name: "Your Cart", exact: true })
    await cart.waitFor({ state: "visible" })
    const drawer = cart.locator(".cart-drawer")
    assert.equal(await drawer.getAttribute("data-presentation"), width < 768 ? "sheet" : "drawer")
    await page.waitForFunction(() => {
      const node = document.querySelector(".cart-drawer")
      if (!node) return false
      const bounds = node.getBoundingClientRect()
      return bounds.left >= -1 && bounds.right <= innerWidth + 1 && bounds.bottom <= innerHeight + 1
    })
    await cart.getByRole("button", { name: "Increase quantity" }).first().click()
    assert.equal(await cart.locator(".quantity-control output").first().textContent(), "2")
    await page.screenshot({ path: new URL(`cart-${width}.png`, output).pathname.replace(/^\/(\w:)/, "$1") })
    await page.keyboard.press("Escape")
    await cart.waitFor({ state: "hidden" })
    pass(`${width}px product → cart, quantity, responsive presentation, Escape`)
    if (width < 768) {
      const bar = page.getByRole("button", { name: /^View cart, 2 items/ })
      await bar.click()
      await cart.waitFor({ state: "visible" })
      await cart.getByRole("button", { name: "Close cart", exact: true }).last().click()
      await cart.waitFor({ state: "hidden" })
      pass(`${width}px mobile cart bar reopens saved cart`)
    }
    await page.emulateMedia({ reducedMotion: "reduce" })
    const hero = page.locator(".hero-carousel")
    if (await hero.count()) {
      await page.waitForFunction(() => document.querySelector(".hero-carousel")?.getAttribute("data-autoplay") === "false")
      assert.equal(await hero.getAttribute("data-transition-ms"), "0")
    }
    pass(`${width}px reduced-motion carousel`)
    assert.deepEqual(errors, [], "No browser runtime exceptions")
    await context.close()
  }
  console.log(`${passed} browser checks passed. No emails or orders sent.`)
} finally { await browser.close() }
