// Real App Router + staging authorization, no email transport or business writes.
import assert from "node:assert/strict";
import { randomUUID, randomBytes } from "node:crypto";
import { createClient } from "@supabase/supabase-js";
import { chromium, expect } from "playwright/test";
process.loadEnvFile("apps/super-admin/.env.local");
const origin = process.env.NAVIGATION_APP_URL ?? "http://localhost:3102";
const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
if (process.env.ALLOW_STAGING_ACCEPTANCE !== "1" || process.env.APP_ENVIRONMENT !== "staging" || new URL(url).hostname !== "jzisqjvroxodvmqxzsob.supabase.co" || !["localhost", "superadmin.qazipro.com"].includes(new URL(origin).hostname)) throw Error("Verified staging resources required");
const admin = createClient(url, process.env.SUPABASE_SERVICE_ROLE_KEY, { auth: { persistSession: false } });
const checked = ({ data, error }) => { if (error) throw Error(error.code ?? "Database operation rejected"); return data };
let userId, browser, checks = 0;
const pass = name => { checks++; console.log(`PASS ${name}`) };
try {
  const email = `qa-navigation-${randomUUID()}@staging.qazipro.invalid`, password = randomBytes(32).toString("base64url");
  userId = checked(await admin.auth.admin.createUser({ email, password, email_confirm: true })).user.id;
  const role = checked(await admin.from("platform_roles").select("id").eq("key", "PLATFORM_OWNER").single());
  checked(await admin.from("platform_staff").insert({ user_id: userId, email, display_name: "Navigation acceptance", status: "ACTIVE" }));
  checked(await admin.from("platform_staff_roles").insert({ staff_user_id: userId, role_id: role.id }));
  const client = createClient(url, process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY, { auth: { persistSession: false } });
  const session = checked(await client.auth.signInWithPassword({ email, password })).session;
  browser = await chromium.launch({ channel: "chrome", headless: true });
  const context = await browser.newContext({ viewport: { width: 1440, height: 900 } });
  const chunks = (`base64-${Buffer.from(JSON.stringify(session)).toString("base64url")}`).match(/.{1,3000}/g);
  await context.addCookies(chunks.map((value, i) => ({ name: chunks.length === 1 ? "qazipro-platform-auth" : `qazipro-platform-auth.${i}`, value, url: origin, sameSite: "Lax" })));
  const page = await context.newPage();
  page.setDefaultTimeout(30000);
  const errors = [];
  page.on("pageerror", error => errors.push(error.message));
  await page.goto(origin);
  await expect(page.locator("main h1")).toBeVisible();
  await page.getByRole("button", { name: "Collapse sidebar", exact: true }).click();
  await page.locator(".platform-sidebar").evaluate(node => { node.dataset.acceptanceIdentity = "same-shell" });
  for (const target of ["/restaurants", "/branches", "/packages", "/domains", "/apps", "/audit", "/settings", "/restaurants"]) {
    const previousHeading = await page.locator("main h1").textContent();
    let release;
    const held = new Promise(resolve => { release = resolve });
    await page.route(`${origin}${target}**`, async route => {
      if (route.request().headers().rsc === "1") await held;
      await route.continue();
    });
    await page.locator('.platform-nav').locator(`a[href="${target}"]`).click();
    try {
      await expect(page.locator('.navigation-hint[data-pending="true"]')).toHaveCount(1);
      await expect(page.locator("main h1")).toHaveText(previousHeading);
      await expect(page.locator(".page-skeleton")).toHaveCount(0);
      await expect(page.locator(".platform-sidebar")).toHaveAttribute("data-acceptance-identity", "same-shell");
      await expect(page.locator(".platform-shell")).toHaveClass(/is-collapsed/);
    } finally { release() }
    await expect(page).toHaveURL(origin + target);
    await expect(page.locator('.navigation-hint[data-pending="true"]')).toHaveCount(0);
    await expect(page.locator("main h1")).toBeVisible();
    await page.unroute(`${origin}${target}**`);
    pass(`${target}: slow navigation retains content, shell and collapse state`);
  }
  const restaurant = page.locator('main a[href^="/restaurants/"]').first();
  if (await restaurant.count()) {
    await restaurant.click();
    await expect(page.getByRole("navigation", { name: "Restaurant sections" })).toBeVisible();
    await expect(page.locator('main [aria-label="Loading restaurant section"]')).toHaveCount(0);
    const links = page.getByRole("navigation", { name: "Restaurant sections" }).getByRole("link");
    for (let i = 1; i < Math.min(await links.count(), 5); i++) {
      const href = await links.nth(i).getAttribute("href");
      await links.nth(i).click();
      await expect(page).toHaveURL(origin + href);
      await expect(page.locator('main [aria-label="Loading restaurant section"]')).toHaveCount(0);
      await expect(page.locator(".platform-sidebar")).toHaveAttribute("data-acceptance-identity", "same-shell");
    }
    pass("Restaurant 360 tabs preserve shell without keyed tab skeleton resets");
  }
  await page.goBack();
  await expect(page.locator("main h1")).toBeVisible();
  await expect(page.locator(".platform-sidebar")).toHaveAttribute("data-acceptance-identity", "same-shell");
  pass("back navigation retains shell");
  for (const width of [360, 390, 768]) {
    await page.setViewportSize({ width, height: 900 });
    await page.getByRole("button", { name: "Open menu", exact: true }).click();
    await expect(page.getByRole("dialog", { name: "Navigation" })).toBeVisible();
    assert.ok(await page.locator(".platform-body").evaluate(node => node.inert));
    await page.keyboard.press("Escape");
    await expect(page.getByRole("button", { name: "Open menu", exact: true })).toBeFocused();
    assert.ok(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth));
    pass(`${width}px menu focus, inert background and no overflow`);
  }
  assert.deepEqual(errors, []);
  pass("zero browser runtime errors");
  console.log(`${checks} checks passed. Staging fixture auth, NOT real Google/OTP acceptance. No emails sent.`);
} finally {
  await browser?.close();
  if (userId) {
    checked(await admin.from("platform_audit_logs").delete().eq("actor_user_id", userId));
    checked(await admin.from("platform_staff").delete().eq("user_id", userId));
    checked(await admin.auth.admin.deleteUser(userId));
    console.log("Temporary navigation fixture removed; business records unchanged.");
  }
}
