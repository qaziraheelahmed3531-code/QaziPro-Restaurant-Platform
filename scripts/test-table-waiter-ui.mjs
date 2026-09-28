// Isolated Playwright regressions. No credentials, live database, email or push.
import assert from "node:assert/strict"
import { readFile } from "node:fs/promises"
import { createRequire } from "node:module"
import { dirname } from "node:path"
import { fileURLToPath } from "node:url"
import { build } from "esbuild"
import { chromium, expect } from "playwright/test"

let passed = 0
const pass = name => { passed++; console.log("PASS " + name) }
async function bundle(app, imports, contents, mocks) {
  const appRoot = fileURLToPath(new URL(`../apps/${app}/`, import.meta.url))
  const appRequire = createRequire(new URL(`../apps/${app}/package.json`, import.meta.url))
  const output = await build({
    tsconfig: appRoot + "tsconfig.json",
    alias: { react: dirname(appRequire.resolve("react")), "react-dom": dirname(appRequire.resolve("react-dom")) },
    stdin: { contents: `import React from "react"; import { createRoot } from "react-dom/client"; ${imports}
      const root = createRoot(document.getElementById("root")); ${contents}`, loader: "tsx", resolveDir: appRoot },
    bundle: true, write: false, format: "iife", platform: "browser", jsx: "automatic",
    plugins: [{ name: "isolated-transport", setup(b) {
      for (const [name, code] of Object.entries(mocks)) {
        b.onResolve({ filter: new RegExp("^" + name.replace(/[.*+?^${}()|[\]\\]/g, "\\$&") + "$") }, () => ({ path: name, namespace: "mock" }))
        b.onLoad({ filter: new RegExp("^" + name.replace(/[.*+?^${}()|[\]\\]/g, "\\$&") + "$"), namespace: "mock" }, () => ({ contents: code, loader: "js" }))
      }
    } }],
  })
  return output.outputFiles[0].text
}

const adminScript = await bundle("admin", `import { WaiterServiceRequests } from "./components/waiter-service-requests"; import { NavigationPending } from "./components/navigation-pending";`, `
  window.requests=[]; window.rpcRequests=[];
  window.showQueue = props => root.render(<WaiterServiceRequests key={props.businessId+":"+props.branchId} {...props}/>);
  window.showNavigation = props => { window.linkPending=props.pending; root.render(<NavigationPending active={props.active} label="Tables"/>); };
`, {
  "next/link": "export const useLinkStatus = () => ({ pending: window.linkPending });",
  "@/lib/supabase/client": `export function createClient() { return {
    channel() { const channel = { on(event, config, callback) { window.subscription=config; window.notifyQueue=callback; return channel; }, subscribe() { return channel; } }; return channel; },
    removeChannel() { return Promise.resolve(); },
    rpc(name,args) { window.rpcRequests.push({ name,args }); return { abortSignal() { return new Promise((resolve,reject) => { window.finishMutation=(value,fail=false) => fail ? reject(Error("private diagnostic")) : resolve(value); }); } }; },
    from(table) { const request={table,filters:[]}; const query={ select() { return query; }, eq(k,v) { request.filters.push([k,v]); return query; }, in(k,v) { request.filters.push([k,v]); return query; }, order() { return query; }, abortSignal() { window.requests.push(request); return new Promise((resolve,reject) => { window.finishRefresh=(value,fail=false) => fail ? reject(Error("private diagnostic")) : resolve(value); }); } }; return query; }
  }; }`,
})
const customerScript = await bundle("customer", `import { TableContextBanner } from "./components/tables/table-context-banner";`, `
  window.calls=[];
  window.fetch=(url,options) => { window.calls.push({url,method:options.method}); return new Promise((resolve,reject) => { window.finishCall=(status,data,fail=false) => fail ? reject(Error("private diagnostic")) : resolve({ok:status>=200&&status<300,json:async()=>data}); }); };
  window.showBanner = table => { window.table=table; root.render(<TableContextBanner key={table?.token ?? "no-table"}/>); };
`, { "@/components/providers/app-provider": "export const useApp=()=>({storefront:{tableContext:window.table,branch:{name:'Downtown branch'}}});" })

const browser = await chromium.launch({ channel: "chrome", headless: true })
const errors = [], external = []
try {
  const context = await browser.newContext({ viewport: { width: 1440, height: 1000 } })
  await context.route("**/*", route => { external.push(route.request().url()); return route.abort() })
  const admin = await context.newPage()
  admin.on("pageerror", error => errors.push(error.message))
  await admin.setContent('<main class="admin-content"><div id="root"></div></main>')
  await admin.addStyleTag({ content: (await readFile(new URL("../apps/admin/app/globals.css", import.meta.url), "utf8")).replace(/@import[^;]+;/g, "") })
  await admin.addScriptTag({ content: adminScript })
  const props = { businessId: "business-a", branchId: "branch-a", initialRequests: [], initialError: false }
  await admin.evaluate(props => window.showQueue(props), props)
  await expect(admin.getByText("No table calls waiting.")).toBeVisible()
  await admin.getByRole("button", { name: "Refresh", exact: true }).evaluate(button => { button.click(); button.click() })
  await expect(admin.getByRole("button", { name: "Refreshing…" })).toBeDisabled()
  assert.equal(await admin.evaluate(() => window.requests.length), 1)
  assert.deepEqual(await admin.evaluate(() => window.requests[0].filters), [["business_id", "business-a"], ["branch_id", "branch-a"], ["status", ["PENDING", "ACKNOWLEDGED"]]])
  const call = { id: "call-a", status: "PENDING", created_at: "2026-09-28T00:00:00Z", restaurant_tables: { name: "Table 12" } }
  await admin.evaluate(call => window.finishRefresh({ data: [call], error: null }), call)
  await expect(admin.getByRole("status")).toHaveText("1 open table call")
  await expect(admin.getByText("Table 12", { exact: true })).toBeVisible()
  assert.equal(await admin.evaluate(() => window.subscription.filter), "branch_id=eq.branch-a")
  pass("waiter queue has branch-scoped query/realtime and deduplicated refresh with accessible notification")
  await admin.evaluate(() => window.notifyQueue())
  await expect.poll(() => admin.evaluate(() => window.requests.length)).toBe(2)
  await admin.evaluate(() => window.finishRefresh(null, true))
  await expect(admin.getByRole("alert")).toContainText("last loaded calls")
  await expect(admin.getByText("Table 12", { exact: true })).toBeVisible()
  pass("realtime refresh failure retains last valid calls without shimmer or silent rejection")
  await admin.getByRole("button", { name: "Acknowledge" }).evaluate(button => { button.click(); button.click() })
  await expect(admin.getByRole("button", { name: "Updating…" }).first()).toBeDisabled()
  assert.equal(await admin.evaluate(() => window.rpcRequests.length), 1)
  assert.deepEqual(await admin.evaluate(() => window.rpcRequests[0]), { name: "respond_to_table_waiter_request", args: { p_request_id: "call-a", p_action: "ACKNOWLEDGE" } })
  await admin.evaluate(() => window.finishMutation({ data: { id: "call-a", status: "ACKNOWLEDGED" }, error: null }))
  await expect.poll(() => admin.evaluate(() => window.requests.length)).toBe(3)
  await admin.evaluate(call => window.finishRefresh({ data: [{ ...call, status: "ACKNOWLEDGED" }], error: null }), call)
  await expect(admin.getByText("Acknowledged", { exact: true })).toBeVisible()
  await expect(admin.getByRole("button", { name: "Acknowledge" })).toHaveCount(0)
  pass("acknowledge is duplicate-safe and renders only the authoritative server state")
  await admin.getByRole("button", { name: "Complete", exact: true }).click()
  await admin.evaluate(() => window.finishMutation({ data: null, error: null }))
  await expect(admin.getByRole("alert")).toContainText("Couldn't confirm")
  await expect(admin.getByRole("button", { name: "Complete", exact: true })).toBeEnabled()
  await expect(admin.getByText("Table 12", { exact: true })).toBeVisible()
  pass("unconfirmed mutation never removes a request or reports success")
  await admin.getByRole("button", { name: "Complete", exact: true }).click()
  await admin.evaluate(() => window.finishMutation({ data: { id: "call-a", status: "COMPLETED" }, error: null }))
  await expect.poll(() => admin.evaluate(() => window.requests.length)).toBe(4)
  await admin.evaluate(() => window.finishRefresh({ data: [], error: null }))
  await expect(admin.getByText("No table calls waiting.")).toBeVisible()
  pass("completion clears the matching request and releases pending state")
  await admin.evaluate(props => window.showQueue(props), { ...props, initialRequests: [call] })
  await admin.evaluate(props => window.showQueue(props), { ...props, branchId: "branch-b", initialError: true })
  await expect(admin.getByRole("alert")).toContainText("couldn't be loaded")
  await expect(admin.getByText("Table 12", { exact: true })).toHaveCount(0)
  await expect(admin.getByText("No table calls waiting.")).toHaveCount(0)
  pass("branch remount clears previous calls; unavailable data is not reported as an empty queue")
  await admin.evaluate(() => window.showNavigation({ pending: true, active: false }))
  await expect(admin.getByRole("status", { name: "Opening Tables" })).toBeVisible()
  await admin.evaluate(() => window.showNavigation({ pending: false, active: false }))
  await expect(admin.getByRole("status")).toHaveCount(0)
  await admin.evaluate(() => window.showNavigation({ pending: true, active: true }))
  await expect(admin.getByRole("status")).toHaveCount(0)
  pass("native link lifecycle removes the spinner on completion/cancellation and active QR descendants")

  const customer = await context.newPage()
  customer.on("pageerror", error => errors.push(error.message))
  await customer.setContent('<div id="root"></div>')
  await customer.addStyleTag({ content: `:root{--ip-brand-primary:#ffff00;--ip-text-inverse:#000;--ip-text-primary:#181818;--ip-surface-brand-subtle:#fff8ea;--ip-border-default:#ddd}*{box-sizing:border-box}body{margin:0}.sr-only{position:absolute;width:1px;height:1px;overflow:hidden;clip-path:inset(50%)}` + await readFile(new URL("../apps/customer/app/interaction-polish.css", import.meta.url), "utf8") })
  await customer.addScriptTag({ content: customerScript })
  const table = { name: "Table 12", token: "table-a", waiterCallEnabled: true }
  await customer.evaluate(table => window.showBanner(table), table)
  await customer.getByRole("button", { name: "Call a waiter" }).evaluate(button => { button.click(); button.click() })
  await expect(customer.getByRole("button", { name: "Calling…" })).toBeDisabled()
  assert.deepEqual(await customer.evaluate(() => window.calls), [{ url: "/api/table-call-waiter", method: "POST" }])
  await customer.evaluate(() => window.finishCall(0, null, true))
  await expect(customer.getByRole("alert")).toContainText("Check your connection")
  await expect(customer.getByRole("button", { name: "Call a waiter" })).toBeEnabled()
  assert.ok(!(await customer.locator("body").innerText()).includes("private diagnostic"))
  pass("customer call has immediate pending, duplicate guard and safe retry after network failure")
  await customer.getByRole("button", { name: "Call a waiter" }).click()
  await customer.evaluate(() => window.finishCall(429, { error: "Please wait before calling again." }))
  await expect(customer.getByRole("alert")).toContainText("Please wait before calling again")
  await customer.getByRole("button", { name: "Call a waiter" }).click()
  await customer.evaluate(() => window.finishCall(200, { status: "PENDING" }))
  await expect(customer.getByRole("button", { name: "Request sent" })).toBeDisabled()
  await expect(customer.getByRole("status")).toContainText("waiter portal")
  pass("rate-limit messaging and confirmed success are honest and screen-reader accessible")
  const colors = await customer.getByRole("button", { name: "Request sent" }).evaluate(button => ({ bg: getComputedStyle(button).backgroundColor, fg: getComputedStyle(button).color }))
  assert.deepEqual(colors, { bg: "rgb(255, 255, 0)", fg: "rgb(0, 0, 0)" })
  pass("call button uses canonical restaurant brand and contrast-aware foreground")
  for (const width of [360, 390, 430, 768, 1440]) {
    await customer.setViewportSize({ width, height: 900 })
    assert.equal(await customer.evaluate(() => document.documentElement.scrollWidth <= innerWidth), true)
    await expect(customer.getByRole("button", { name: "Change order mode" })).toBeVisible()
  }
  pass("table call banner has no horizontal overflow at 360/390/430/tablet/desktop")
  await customer.evaluate(table => window.showBanner(table), { ...table, waiterCallEnabled: false })
  await expect(customer.getByRole("button", { name: /Call a waiter|Request sent/ })).toHaveCount(0)
  await customer.evaluate(table => window.showBanner(table), { ...table, token: "table-b" })
  await expect(customer.getByRole("button", { name: "Call a waiter" })).toBeEnabled()
  await customer.getByRole("button", { name: "Change order mode" }).click()
  await expect(customer.getByRole("button", { name: "Leave dine-in", exact: true })).toBeVisible()
  await customer.getByRole("button", { name: "Keep table" }).click()
  await expect(customer.getByRole("button", { name: "Change order mode" })).toBeVisible()
  pass("off setting hides calling, a new table resets state, and existing explicit mode-change flow stays intact")
  assert.deepEqual(errors, []); assert.deepEqual(external, [])
  pass("zero browser runtime errors and zero external requests")
} finally { await browser.close() }
console.log(`${passed} isolated waiter/navigation browser checks passed; not live RLS evidence.`)
