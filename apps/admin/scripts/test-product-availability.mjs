// Actual menu + availability components; transport and unrelated collection sorting
// are mocked. Never uses credentials or real APIs.
import assert from "node:assert/strict";
import { fileURLToPath } from "node:url";
import { build } from "esbuild";
import { chromium, expect } from "playwright/test";

const admin = fileURLToPath(new URL("../", import.meta.url));
const output = await build({
  stdin: { contents: `
    import React from "react";
    import { createRoot } from "react-dom/client";
    import { ProductsManager } from "./components/products-manager";
    const root = createRoot(document.getElementById("root"));
    window.requests = []; window.refreshCount = 0; window.syncCalls = 0;
    window.fetch = async () => { window.syncCalls++; return { ok: window.syncOk !== false, json: async () => ({ revalidated: window.syncOk !== false }) }; };
    window.renderMenu = initialProducts => root.render(<ProductsManager businessId="business-a" categories={[{ id: "category-a", name: "Pizzas", sort_order: 0 }]} posSections={[]} initialProducts={initialProducts} groups={[]} canManageOptions={false}/>);
  `, resolveDir: admin, loader: "tsx" },
  bundle: true, write: false, format: "iife", platform: "browser", jsx: "automatic",
  plugins: [{ name: "isolated-transport", setup(b) {
    b.onResolve({ filter: /^(@\/lib\/supabase\/client|next\/navigation|@\/components\/collection-order)$/ }, args => ({ path: args.path, namespace: "mock" }));
    b.onLoad({ filter: /.*/, namespace: "mock" }, args => ({ loader: "js", contents: args.path === "next/navigation"
      ? `export function useRouter() { return { refresh() { window.refreshCount++ } }; }`
      : args.path === "@/components/collection-order" ? `export function CollectionOrder() { return null; }`
      : `export function createClient() { return { from(table) {
        const request = { table, filters: [] };
        const query = {
          update(value) { request.value = value; return query; },
          eq(key, value) { request.filters.push([key, value]); return query; },
          select() { return query; },
          maybeSingle() { window.requests.push(request); return new Promise((resolve, reject) => { window.finish = (value, thrown) => thrown ? reject(Error("offline")) : resolve(value); }); }
        }; return query;
      } }; }` }));
  } }],
});
const browser = await chromium.launch({ channel: "chrome", headless: true });
let checks = 0;
const pass = name => { checks++; console.log("PASS " + name); };
try {
  const context = await browser.newContext();
  const external = [], errors = [];
  await context.route("**/*", route => { external.push(route.request().url()); return route.abort(); });
  const page = await context.newPage();
  page.on("pageerror", e => { errors.push(e.message); console.error("Browser error:", e.message); });
  await page.setContent('<div id="root"></div>');
  await page.addScriptTag({ content: output.outputFiles[0].text });
  const pizza = { id: "pizza-a", name: "Margherita", slug: "margherita", sku: "P01", category_id: "category-a", pos_section_id: null, description: "", base_price: 900, sale_price: null, badge: null, is_available: true, is_featured: false, is_active: true, sort_order: 0, product_images: [], product_modifier_groups: [] };
  await page.evaluate(products => window.renderMenu(products), [pizza]);
  const tile = () => page.getByRole("button", { name: /^Margherita:/ });
  await expect(tile()).toHaveAttribute("aria-pressed", "true");
  await expect(page.getByText("No active products", { exact: false })).toHaveCount(0);
  assert.deepEqual(await page.evaluate(() => window.requests), []);
  pass("server-loaded menu immediately supplies availability; no duplicate query or false empty state");
  await tile().evaluate(button => { button.click(); button.click(); });
  await expect(tile()).toBeDisabled();
  await expect(tile()).toContainText("UPDATING");
  const requests = await page.evaluate(() => window.requests);
  assert.equal(requests.length, 1);
  assert.deepEqual(requests[0], { table: "products", value: { is_available: false }, filters: [["business_id", "business-a"], ["id", "pizza-a"], ["is_active", true], ["is_available", true]] });
  pass("double-click sends one tenant-scoped conditional write with pending feedback");
  await page.evaluate(() => window.finish({ data: { id: "pizza-a", is_available: false }, error: null }));
  await expect(tile()).toHaveAttribute("aria-pressed", "false");
  await expect(page.locator(".product-flags")).toContainText("Out of stock");
  await expect(page.getByRole("status")).toContainText("Margherita is now out of stock");
  assert.equal(await page.evaluate(() => window.syncCalls), 1);
  pass("confirmed update synchronizes availability tile and product card and requests storefront refresh once");
  await page.evaluate(products => window.renderMenu(products), [pizza]);
  await expect(tile()).toHaveAttribute("aria-pressed", "true");
  await expect(page.locator(".product-flags")).toContainText("In stock");
  pass("new authoritative server snapshot replaces local confirmation patch");
  await tile().click();
  await page.evaluate(() => window.finish({ data: null, error: { message: "permission denied" } }));
  await expect(page.getByRole("alert")).toContainText("could not be saved");
  await expect(tile()).toBeEnabled();
  await expect(tile()).toHaveAttribute("aria-pressed", "true");
  assert.equal(await page.evaluate(() => window.syncCalls), 1);
  pass("denied write preserves displayed stock and does not revalidate");
  await tile().click();
  await page.evaluate(() => window.finish({ data: null, error: null }));
  await expect(page.getByRole("alert")).toContainText("changed or is no longer editable");
  await expect(tile()).toHaveAttribute("aria-pressed", "true");
  pass("zero affected rows cannot masquerade as successful mutation");
  await tile().click();
  await page.evaluate(() => window.finish(null, true));
  await expect(page.getByRole("alert")).toContainText("Connection interrupted");
  await expect(tile()).toBeEnabled();
  pass("transport exception releases pending lock and explains uncertain outcome");
  await tile().click();
  await page.evaluate(() => { window.syncOk = false; window.finish({ data: { id: "pizza-a", is_available: false }, error: null }); });
  await expect(page.getByRole("alert")).toContainText("Availability saved. Customer website refresh is not confirmed");
  await expect(tile()).toHaveAttribute("aria-pressed", "false");
  await expect(page.locator(".product-flags")).toContainText("Out of stock");
  pass("storefront refresh failure is explicit without rolling back a committed database change");
  assert.deepEqual(external, []);
  assert.deepEqual(errors, []);
  pass("zero external requests or browser runtime errors");
  console.log(`${checks} checks passed`);
} finally { await browser.close(); }
