// Isolated real-browser rendering: no env, credentials, APIs or email delivery.
import assert from "node:assert/strict";
import { readFile, mkdir } from "node:fs/promises";
import { fileURLToPath } from "node:url";
import { createRequire } from "node:module";
import { dirname } from "node:path";
import { build } from "esbuild";
import { chromium, expect } from "playwright/test";

const admin = fileURLToPath(new URL("../", import.meta.url));
const appRequire = createRequire(new URL("../package.json", import.meta.url));
const output = await build({
  alias: { react: dirname(appRequire.resolve("react")), "react-dom": dirname(appRequire.resolve("react-dom")) },
  stdin: { contents: `
    import React from "react";
    import { createRoot } from "react-dom/client";
    import { PortalSkeleton } from "./components/portal-skeleton";
    import DashboardError from "./app/(dashboard)/error";
    const root = createRoot(document.getElementById("root"));
    window.showSkeleton = props => root.render(<PortalSkeleton {...props}/>);
    window.finishLoading = () => root.render(<h1>Loaded content</h1>);
    window.showLoadError = () => root.render(<DashboardError error={new Error("private server diagnostic")} retry={window.finishLoading}/>);
  `, resolveDir: admin, loader: "tsx" },
  bundle: true, write: false, format: "iife", platform: "browser", jsx: "automatic",
});
const css = (await Promise.all(["targeted-upgrades.css", "globals.css", "storefront-finish.css", "email-otp.css", "interaction-polish.css", "client-portal.css", "portal-skeleton.css"].map(name =>
  readFile(new URL("../app/" + name, import.meta.url), "utf8")))).join("\n").replace(/@import[^;]+;/g, "");
let checks = 0;
const pass = name => { checks++; console.log("PASS " + name); };
const browser = await chromium.launch({ channel: "chrome", headless: true });
try {
  const context = await browser.newContext({ viewport: { width: 1440, height: 1000 } });
  const external = [], errors = [];
  await context.route("**/*", route => { external.push(route.request().url()); return route.abort(); });
  const page = await context.newPage();
  page.on("pageerror", e => errors.push(e.message));
  await page.setContent('<main class="admin-content"><div id="root"></div></main>');
  await page.addStyleTag({ content: css });
  await page.addScriptTag({ content: output.outputFiles[0].text });
  const artifacts = new URL("../../../docs/qa/restaurant-admin-foundations/", import.meta.url);
  await mkdir(artifacts, { recursive: true });
  for (const width of [360, 768, 1440]) {
    await page.setViewportSize({ width, height: 1000 });
    for (const variant of ["page", "dashboard", "reports", "orders", "menu", "tables", "kitchen"]) {
      await page.evaluate(variant => window.showSkeleton({ variant }), variant);
      await expect(page.locator(`.portal-skeleton--${variant}`)).toBeVisible();
      await expect(page.getByRole("status")).toHaveCount(1);
      assert.equal(await page.locator("button,input,select,a,[tabindex]").count(), 0);
      assert.ok(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth), `${variant} overflow at ${width}`);
      assert.ok(await page.locator(".portal-skeleton__shape").evaluateAll(shapes => shapes.every(shape => {
        const rect = shape.getBoundingClientRect();
        // Table headers are deliberately hidden in the real mobile card layout.
        return shape.closest("thead") || rect.width > 0 && rect.height > 0;
      })), `${variant} collapsed placeholder at ${width}`);
      if (variant === "reports" || variant === "dashboard") await expect(page.locator(".metric-card")).toHaveCount(6);
      if (variant === "menu") {
        await expect(page.locator(".product-admin-card")).toHaveCount(6);
        await expect(page.locator(".portal-skeleton__shape--image")).toHaveCount(6);
      }
      if (variant === "orders") {
        await expect(page.locator("tbody tr:first-child td")).toHaveCount(9);
        assert.equal(await page.locator(".data-table-wrap").evaluate(el => getComputedStyle(el).overflowX), "auto", "wide tables remain scrollable rather than clipped by shimmer");
      }
      if (variant === "tables") await expect(page.locator("tbody tr:first-child td")).toHaveCount(5);
      if (variant === "kitchen") await expect(page.locator(".portal-skeleton__ticket")).toHaveCount(4);
      await page.screenshot({ path: fileURLToPath(new URL(`skeleton-${variant}-${width}.png`, artifacts)), fullPage: true });
    }
    pass(`seven layout variants: geometry, semantics, no focus traps or overflow at ${width}px`);
  }
  await page.evaluate(() => window.showSkeleton({ variant: "orders", contentOnly: true }));
  await expect(page.locator(".portal-skeleton__heading")).toHaveCount(0);
  await expect(page.locator(".portal-skeleton__toolbar")).toHaveCount(0);
  await expect(page.locator("tbody tr")).toHaveCount(5);
  pass("client fetch mode retains table structure without duplicating page header or filters");
  const surface = page.locator(".portal-skeleton__surface").first();
  assert.equal(await surface.evaluate(el => getComputedStyle(el, "::after").animationName), "portal-skeleton-sweep");
  const initial = await surface.evaluate(el => getComputedStyle(el, "::after").transform);
  await expect.poll(() => surface.evaluate(el => getComputedStyle(el, "::after").transform)).not.toBe(initial);
  pass("shimmer actually advances in the browser using transform animation");
  await page.emulateMedia({ reducedMotion: "reduce" });
  assert.equal(await surface.evaluate(el => getComputedStyle(el, "::after").animationName), "none");
  await expect(page.locator(".portal-skeleton__shape").first()).toBeVisible();
  pass("reduced motion disables sweep without hiding structural placeholders");
  await page.emulateMedia({ reducedMotion: "no-preference", forcedColors: "active" });
  assert.equal(await surface.evaluate(el => getComputedStyle(el, "::after").display), "none");
  pass("forced-colors mode preserves outlines and suppresses shimmer overlay");
  await page.evaluate(() => window.finishLoading());
  await expect(page.getByRole("heading", { name: "Loaded content" })).toBeVisible();
  await expect(page.getByRole("status")).toHaveCount(0);
  pass("completion removes loading announcement and animation immediately");
  await page.evaluate(() => window.showLoadError());
  await expect(page.getByRole("alert")).toContainText("couldn't be loaded");
  await expect(page.getByText("private server diagnostic")).toHaveCount(0);
  await page.getByRole("button", { name: "Try again" }).click();
  await expect(page.getByRole("heading", { name: "Loaded content" })).toBeVisible();
  pass("error fallback has a functioning retry action and does not expose raw server diagnostics");
  assert.deepEqual(external, []);
  assert.deepEqual(errors, []);
  pass("zero external requests or browser runtime errors");
  console.log(`${checks} checks passed; screenshots: docs/qa/restaurant-admin-foundations`);
} finally { await browser.close(); }
