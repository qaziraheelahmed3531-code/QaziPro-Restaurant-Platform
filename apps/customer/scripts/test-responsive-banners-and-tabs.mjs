import assert from "node:assert/strict"
import { existsSync } from "node:fs"
import { chromium } from "playwright"

const baseUrl = process.env.CUSTOMER_TEST_URL || "http://localhost:3000"
const installedChrome = [
  "C:/Program Files/Google/Chrome/Application/chrome.exe",
  "C:/Program Files (x86)/Google/Chrome/Application/chrome.exe",
].find(existsSync)
const browser = await chromium.launch({ headless: true, ...(installedChrome ? { executablePath: installedChrome } : {}) })

async function assertFullBanner(locator, label) {
  await locator.scrollIntoViewIfNeeded()
  const measurement = await locator.evaluate(async (container) => {
    const image = container.querySelector("img")
    if (!image) throw new Error("Banner image is missing")
    if (!image.complete || !image.naturalHeight) await image.decode()
    const bounds = container.getBoundingClientRect()
    return {
      containerRatio: bounds.width / bounds.height,
      imageRatio: image.naturalWidth / image.naturalHeight,
      objectFit: getComputedStyle(image).objectFit,
    }
  })
  assert.equal(measurement.objectFit, "contain", `${label} must preserve the full source image`)
  assert.ok(Math.abs(measurement.containerRatio - measurement.imageRatio) < 0.02, `${label} must not add top/bottom letterboxing`)
}

try {
  const page = await browser.newPage({ viewport: { width: 390, height: 844 } })
  await page.goto(baseUrl, { waitUntil: "networkidle" })

  const locationDialog = page.locator("dialog[open]")
  if (await locationDialog.isVisible().catch(() => false)) {
    await locationDialog.getByRole("button", { name: "Pickup" }).click()
    await locationDialog.getByRole("button", { name: "Start ordering" }).click()
  }

  await page.locator(".hero-carousel").waitFor({ state: "visible" })
  await page.waitForTimeout(650)
  await assertFullBanner(page.locator(".hero-carousel"), "mobile hero")
  await assertFullBanner(page.locator(".category-banner").first(), "mobile category banner")

  await page.getByRole("button", { name: /Open cart/ }).first().click()
  const drawer = page.locator(".cart-drawer")
  await page.waitForTimeout(60)
  assert.notEqual(await drawer.evaluate(node => getComputedStyle(node).transform), "none", "cart should animate in from the right")
  await page.waitForTimeout(600)
  assert.equal(await drawer.evaluate(node => getComputedStyle(node).borderTopLeftRadius), "18px", "cart front corners should be rounded")
  await drawer.locator("[data-cart-close]").click()
  await page.waitForTimeout(60)
  assert.notEqual(await drawer.evaluate(node => getComputedStyle(node).transform), "none", "cart should animate out to the right")
  await page.waitForTimeout(600)
  assert.equal(await page.locator(".cart-drawer-dialog").evaluate(node => node.open), false, "cart dialog should close after its exit animation")

  await page.locator(".category-menu-section").nth(1).scrollIntoViewIfNeeded()
  await page.waitForTimeout(250)
  const stickyTabs = page.locator(".sticky-category-nav")
  assert.equal(await stickyTabs.getAttribute("aria-hidden"), "false", "category tabs should appear while browsing menu sections")

  await page.locator(".site-footer").scrollIntoViewIfNeeded()
  await page.waitForTimeout(250)
  assert.equal(await stickyTabs.getAttribute("aria-hidden"), "true", "category tabs must hide over the footer")

  await page.setViewportSize({ width: 1440, height: 900 })
  await page.emulateMedia({ reducedMotion: "reduce" })
  await page.goto(baseUrl, { waitUntil: "networkidle" })
  // A fresh opening always asks for location, even when Pickup was saved before.
  await page.locator('.location-dialog[open]').waitFor()
  await page.locator('.location-dialog[open]').getByRole('button', { name: 'Start ordering' }).click()
  await page.locator('.location-dialog[open]').waitFor({state:'detached'})
  await page.waitForTimeout(650)
  await assertFullBanner(page.locator(".hero-carousel"), "desktop hero")
  await assertFullBanner(page.locator(".category-banner").first(), "desktop category banner")

  const hero = page.locator(".hero-carousel")
  const transitionMs = Number(await hero.getAttribute("data-transition-ms"))
  assert.ok(transitionMs >= 350, "saved hero transition speed must remain active even when Windows Reduced Motion is enabled")
  const previousIndex = await hero.getAttribute("data-active-index")
  await page.locator(".hero-arrow--next").click({ force: true })
  await page.waitForTimeout(90)
  const movingTransforms = await page.locator(".hero-slide").evaluateAll(nodes => nodes.map(node => getComputedStyle(node).transform))
  assert.ok(movingTransforms.length >= 2, "smooth hero change must keep outgoing and incoming slides during the transition")
  assert.ok(movingTransforms.some(transform => transform !== "none" && transform !== "matrix(1, 0, 0, 1, 0, 0)"), "hero banners must visibly move during the saved transition")
  await page.waitForTimeout(transitionMs + 120)
  assert.notEqual(await hero.getAttribute("data-active-index"), previousIndex, "hero banner must advance to the next slide")

  console.log("PASS: full banners, saved smooth hero motion (including Windows Reduced Motion), cart animation, and sticky tabs are working")
} finally {
  await browser.close()
}
