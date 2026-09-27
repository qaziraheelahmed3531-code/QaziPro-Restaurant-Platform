// Component/browser regression only: no credentials, database writes or email transports.
import assert from "node:assert/strict"
import { readFile, mkdir } from "node:fs/promises"
import { fileURLToPath } from "node:url"
import { build } from "esbuild"
import { chromium, expect } from "playwright/test"
import { parseTableDraft } from "../lib/table-draft.ts"

let checks = 0
function pass(name) { checks++; console.log("PASS " + name) }
assert.deepEqual(parseTableDraft({ name: "  Terrace 7 ", code: " t07 ", seats: "4" }),
  { ok: true, value: { name: "Terrace 7", code: "T07", seats: 4 } })
for (const draft of [
  { name: " ", code: "T1", seats: "4" }, { name: "A", code: " ", seats: "4" },
  { name: "x".repeat(81), code: "T1", seats: "4" }, { name: "A", code: "x".repeat(41), seats: "4" },
  ...["", "0", "-1", "1.5", "101", "NaN", "Infinity"].map(seats => ({ name: "A", code: "T1", seats })),
]) assert.equal(parseTableDraft(draft).ok, false)
pass("table draft normalization and 11 invalid input cases")

const admin = fileURLToPath(new URL("../", import.meta.url))
const mock = `
  export function createClient() {
    return { from(table) {
      const request = { table, operation: "read", filters: [] };
      const run = () => new Promise((resolve, reject) => {
        window.requests.push(request);
        window.finish = (value, thrown = false) => thrown ? reject(Error("offline")) : resolve(value);
      });
      const query = {
        insert(value) { request.operation = "insert"; request.value = value; return query },
        update(value) { request.operation = "update"; request.value = value; return query },
        select() { return query },
        eq(key, value) { request.filters.push([key, value]); return query },
        single: run, maybeSingle: run, order: run
      };
      return query;
    }};
  }
`
const output = await build({
  stdin: { contents: `
    import React from "react";
    import { createRoot } from "react-dom/client";
    import { TableManager } from "./components/table-manager";
    const root = createRoot(document.getElementById("root"));
    window.requests = [];
    window.renderTables = props => root.render(<TableManager key={props.businessId+":"+props.branchId} {...props}/>);
  `, resolveDir: admin, loader: "tsx" },
  bundle: true, write: false, format: "iife", platform: "browser", jsx: "automatic",
  plugins: [{ name: "no-external-transport", setup(b) {
    b.onResolve({ filter: /^@\/lib\/supabase\/client$/ }, () => ({ path: "mock", namespace: "test" }))
    b.onLoad({ filter: /.*/, namespace: "test" }, () => ({ contents: mock, loader: "js" }))
  } }],
})
const css = (await Promise.all(["globals.css", "interaction-polish.css", "client-portal.css"].map(name =>
  readFile(new URL("../app/" + name, import.meta.url), "utf8")))).join("\n").replace(/@import[^;]+;/g, "")
const browser = await chromium.launch({ channel: "chrome", headless: true })
try {
  const context = await browser.newContext({ viewport: { width: 1440, height: 1000 } })
  const external = []
  await context.route("**/*", route => { external.push(route.request().url()); return route.abort() })
  const page = await context.newPage(), errors = []
  page.on("pageerror", e => errors.push(e.message))
  await page.setContent('<main class="admin-content"><div id="root"></div></main>')
  await page.addStyleTag({ content: css })
  await page.addScriptTag({ content: output.outputFiles[0].text })
  const first = { id: "table-a", name: "Table A", code: "A1", seats: 4, is_active: true }
  await page.evaluate(props => window.renderTables(props), { businessId: "business-a", branchId: "branch-a", initialTables: [first] })
  await expect(page.getByRole("heading", { name: "Restaurant tables" })).toBeVisible()
  await page.getByLabel("Table name").fill("New table")
  await page.getByLabel("Code", { exact: true }).fill("new")
  await page.locator("form").evaluate(form => {
    form.dispatchEvent(new Event("submit", { bubbles: true, cancelable: true }))
    form.dispatchEvent(new Event("submit", { bubbles: true, cancelable: true }))
  })
  await expect(page.getByRole("button", { name: "Creating…" })).toBeDisabled()
  assert.equal(await page.evaluate(() => window.requests.length), 1)
  const request = await page.evaluate(() => window.requests[0])
  assert.deepEqual(request.value, { business_id: "business-a", branch_id: "branch-a", name: "New table", code: "NEW", seats: 4 })
  pass("double submit creates one scoped request and a visible pending state")
  await page.evaluate(() => window.finish(null, true))
  await expect(page.getByRole("alert")).toContainText("Connection interrupted")
  await expect(page.getByLabel("Table name")).toHaveValue("New table")
  await expect(page.getByRole("button", { name: "Create table", exact: true })).toBeEnabled()
  pass("thrown failures release pending lock and retain form values")
  await page.getByRole("button", { name: "Create table", exact: true }).click()
  await page.evaluate(() => window.finish({ data: null, error: { code: "23505" } }))
  await expect(page.getByRole("alert")).toContainText("already exists")
  pass("duplicate table code returns actionable inline error")
  await page.getByRole("button", { name: "Create table", exact: true }).click()
  await page.evaluate(() => window.finish({ data: { id: "new", name: "New table", code: "NEW", seats: 4, is_active: true }, error: null }))
  await expect(page.getByRole("status")).toHaveText("New table created.")
  await expect(page.getByLabel("Table name")).toHaveValue("")
  pass("successful creation updates list and clears form")
  const row = page.getByRole("row").filter({ has: page.getByText("Table A", { exact: true }) })
  await row.getByRole("button", { name: "Deactivate", exact: true }).click()
  await expect(row.getByText("New waiter bills", { exact: false })).toBeVisible()
  await row.getByRole("button", { name: "Cancel", exact: true }).click()
  assert.equal(await page.evaluate(() => window.requests.length), 3)
  pass("deactivation requires confirmation; cancellation makes no request")
  await row.getByRole("button", { name: "Deactivate", exact: true }).click()
  await row.getByRole("button", { name: "Confirm deactivation" }).evaluate(button => { button.click(); button.click() })
  await expect(row.getByRole("button", { name: "Deactivating…" })).toBeDisabled()
  assert.equal(await page.evaluate(() => window.requests.length), 4)
  assert.deepEqual(await page.evaluate(() => window.requests.at(-1).filters),
    [["id", "table-a"], ["business_id", "business-a"], ["branch_id", "branch-a"], ["is_active", true]])
  pass("toggle uses tenant, branch and expected-status conditions; duplicate click is blocked")
  await page.evaluate(() => window.finish({ data: null, error: { code: "23514" } }))
  await expect(page.getByRole("alert")).toContainText("Close the active bill")
  await expect(row.getByText("ACTIVE", { exact: true })).toBeVisible()
  pass("active-bill denial preserves rendered status")
  await row.getByRole("button", { name: "Confirm deactivation" }).click()
  await page.evaluate(() => window.finish({ data: null, error: null }))
  await expect(page.getByRole("alert")).toContainText("changed or is no longer accessible")
  pass("stale or denied update is never shown as success")
  await row.getByRole("button", { name: "Confirm deactivation" }).click()
  await page.evaluate(data => window.finish({ data, error: null }), { ...first, is_active: false })
  await expect(row.getByRole("button", { name: "Activate", exact: true })).toBeVisible()
  pass("confirmed status updates replace only the matching row")
  for (const [width, height] of [[360, 800], [768, 1024], [1440, 1000]]) {
    await page.setViewportSize({ width, height })
    assert.equal(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth + 1), true)
    await expect(page.getByRole("button", { name: "Create table", exact: true })).toBeVisible()
    pass("usable table layout without horizontal overflow at " + width)
  }
  await page.emulateMedia({ reducedMotion: "reduce" })
  await page.getByRole("button", { name: "Create table", exact: true }).hover()
  assert.equal(await page.getByRole("button", { name: "Create table", exact: true }).evaluate(el => getComputedStyle(el).transform), "none")
  pass("reduced motion removes button translation")
  await page.evaluate(props => window.renderTables(props), { businessId: "business-b", branchId: "branch-b", initialTables: [], loadError: true })
  await expect(page.getByRole("alert")).toContainText("couldn't be loaded")
  await expect(page.getByText("Table A", { exact: true })).toHaveCount(0)
  await expect(page.getByRole("button", { name: "Create table", exact: true })).toBeDisabled()
  pass("branch remount clears old data; failed load is not an empty-list success")
  await page.getByRole("button", { name: "Refresh tables", exact: true }).click()
  await page.evaluate(() => window.finish({ data: [], error: null }))
  await expect(page.getByRole("heading", { name: "Your floor plan starts here" })).toBeVisible()
  await expect(page.getByRole("button", { name: "Create table", exact: true })).toBeEnabled()
  pass("refresh recovers unavailable state")
  assert.deepEqual(errors, []); assert.deepEqual(external, [])
  pass("zero browser runtime errors and zero external requests")
  const artifacts = new URL("../../../docs/qa/restaurant-admin-foundations/", import.meta.url)
  await mkdir(artifacts, { recursive: true })
  await page.screenshot({ path: fileURLToPath(new URL("tables-empty-desktop.png", artifacts)), fullPage: true })
  console.log(`PASS: ${checks} checks. Mocked transport: not live RLS or public E2E evidence.`)
} finally { await browser.close() }
