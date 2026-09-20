import assert from "node:assert/strict";
import { chromium } from "playwright";

const origin = process.argv[2] ?? "http://localhost:3100";
assert.equal(new URL(origin).hostname, "localhost");

const browser = await chromium.launch({ headless: true, channel: "chrome" });
try {
  const page = await browser.newPage({ viewport: { width: 390, height: 844 } });
  const errors = [];
  page.on("pageerror", error => errors.push(error.message));
  await page.goto(origin, { waitUntil: "domcontentloaded", timeout: 90_000 });

  const location = page.locator("dialog[open]");
  await location.waitFor({ state: "visible", timeout: 15_000 }).catch(() => undefined);
  if (await location.isVisible().catch(() => false)) {
    await location.getByRole("button", { name: "Pickup", exact: true }).click();
    await location.locator(".pickup-panel").waitFor({ state: "visible" });
    await location.locator(".pickup-panel").getByRole("button", { name: "Start ordering", exact: true }).click();
    await location.waitFor({ state: "hidden", timeout: 15_000 });
  }

  assert.equal(await page.getByText("Tap a category and get straight to the food.", { exact: true }).count(), 0);
  assert.equal(await page.getByText("CUSTOMER TRUST", { exact: true }).count(), 0);

  const add = page.getByRole("button", { name: "Add", exact: true }).filter({ visible: true }).first();
  await add.click();
  const customize = page.getByRole("button", { name: /^Add to Cart/ });
  if (await customize.isVisible().catch(() => false)) await customize.click();
  const cart = page.locator(".cart-drawer");
  if (!await cart.isVisible().catch(() => false))
    await page.getByRole("button", { name: /Open cart with 1 items/i }).first().click();
  await cart.getByRole("heading", { name: "Your Cart", exact: true }).waitFor();
  assert.equal(await cart.getByText("Your order", { exact: true }).count(), 0);
  await cart.getByRole("link", { name: "Checkout", exact: true }).click();
  await page.getByRole("heading", { name: "Complete your order", exact: true }).waitFor();
  assert.equal(await page.getByText("SECURE CHECKOUT", { exact: true }).count(), 0);
  assert.deepEqual(errors, []);
  console.log("PASS: storefront copy is clean on home, cart and checkout with no removed AI-style labels.");
} finally {
  await browser.close();
}
