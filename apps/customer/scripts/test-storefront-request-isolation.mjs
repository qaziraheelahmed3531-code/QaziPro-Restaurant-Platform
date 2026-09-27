// Executes actual resolver/route code against instrumented clients, never a database.
import assert from "node:assert/strict"
import { readFileSync } from "node:fs"
import { createRequire } from "node:module"
import vm from "node:vm"
const require = createRequire(import.meta.url)
const ts = require("typescript")
function load(path, imports, globals = {}) {
  const exports = {}
  const source = ts.transpileModule(readFileSync(new URL(path, import.meta.url), "utf8"), { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 } }).outputText
  vm.runInNewContext(source, { exports, console, process: { env: { NODE_ENV: "production", NEXT_PUBLIC_SUPABASE_URL: "https://staging.example.test", NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY: "non-secret-test-key" } }, ...globals, require: name => {
    if (name === "server-only") return {}
    if (name in imports) return imports[name]
    throw Error(`Unexpected dependency ${name}`)
  } })
  return exports
}
let hostname = "unknown.staging.qazipro.com", resolvedId = null, businessReads = 0
let queriedId = null
const resolver = load("../lib/storefront/server.ts", {
  react: { cache: fn => fn },
  "next/headers": { headers: async () => ({ get: key => key === "host" ? hostname : key === "x-qazipro-business-slug" ? "restaurant-a" : null }), cookies: async () => ({ get: () => undefined }) },
  "@italian-pizza/shared/domains": { normalizeHostname: value => (value ?? "").toLowerCase(), requestHostname: ({ host }) => host },
  "@/lib/storefront/fallback": { fallbackStorefront: { business: {}, branch: {}, products: [], deals: [], menuSections: [], heroSlides: [] } },
  "@supabase/supabase-js": { createClient: () => ({
    rpc: () => ({ maybeSingle: async () => ({ data: resolvedId ? { resolved_business_id: resolvedId, resolved_business_slug: "canonical" } : null, error: null }) }),
    from: () => { businessReads++; const query = { select: () => query, eq: (key, value) => { if (key === "id") queriedId = value; return query }, maybeSingle: async () => ({ data: { id: resolvedId, name: "Scoped restaurant", branches: [] }, error: null }) }; return query },
  }) },
})
for (const value of ["unknown.staging.qazipro.com", "qazipro-restaurant-customer-staging.vercel.app", "disabled.staging.qazipro.com"]) {
  hostname = value
  const result = await resolver.getStorefrontSnapshot()
  assert.equal(result.resolutionError, "TENANT_NOT_FOUND")
  assert.equal(businessReads, 0, "Untrusted slug header must never fall back to business lookup")
}
for (const id of ["business-a", "business-b", "business-a"]) {
  resolvedId = id
  await resolver.getStorefrontSnapshot()
  assert.equal(queriedId, id, "Alternating canonical resolutions stay business-scoped")
}
console.log("PASS hostname failure closes before business query; forged slug ignored; alternating businesses scoped")

const calls = []
let storefront = { business: { id: "business-a" }, orderPersistence: "database" }
const imports = {
  "next/server": { NextResponse: { json: (body, options) => ({ body, ...options }) } },
  "@/lib/storefront/server": { getStorefrontSnapshot: async () => storefront },
  "@/lib/api/v1": { consumeRateLimit: async () => true },
  "@/lib/orders/server": {
    currentUserId: async () => "customer-a",
    listCustomerOrders: async (...args) => { calls.push(args); return [] },
    getAccessibleOrder: async (...args) => { calls.push(args); return null },
    cancelAccessibleOrder: async (...args) => { calls.push(args); return null },
  },
}
const list = load("../app/api/orders/route.ts", imports)
const detail = load("../app/api/orders/[id]/route.ts", imports)
const cancel = load("../app/api/orders/[id]/cancel/route.ts", imports)
const request = { headers: { get: () => "test-tracking-token" } }
const params = { params: Promise.resolve({ id: "order-a" }) }
await list.GET()
assert.equal(calls.at(-1)[1], "business-a")
await detail.GET(request, params)
assert.equal(calls.at(-1)[3], "business-a")
await cancel.POST(request, params)
assert.equal(calls.at(-1)[3], "business-a")
const previousCalls = calls.length
storefront = { business: { id: null }, orderPersistence: "unavailable" }
await list.GET(); await detail.GET(request, params); await cancel.POST(request, params)
assert.equal(calls.length, previousCalls, "Unavailable hosts cannot read or cancel orders")
console.log("PASS website order list, detail and cancellation require canonical hostname business scope")

let accessibleOrder = null, writes = 0, record = null, limited = false
const feedbackScopes = []
const feedback = load("../app/api/orders/[id]/feedback/route.ts", {
  ...imports,
  "@/lib/api/v1": { consumeRateLimit: async () => !limited },
  "@/lib/orders/server": { getAccessibleOrder: async (...args) => { feedbackScopes.push(args); return accessibleOrder } },
  "@/lib/supabase/admin": { createAdminClient: () => ({
    from: () => { const scope = []; const query = { select: () => query, eq: (key, value) => { scope.push([key, value]); return query }, maybeSingle: async () => { assert.deepEqual(scope, [["business_id", "business-a"], ["order_id", "order-a"]]); return { data: record, error: null } } }; return query },
    rpc: async (name, args) => { assert.equal(name, "submit_verified_order_feedback"); assert.equal(args.p_business_id, "business-a"); writes++; record ??= { rating: args.p_rating, comment: args.p_comment }; return { data: record, error: null } },
  }) },
})
const feedbackRequest = body => ({ ...request, text: async () => JSON.stringify(body) })
const validFeedback = feedbackRequest({ rating: 5, comment: "Good meal" })
assert.equal((await feedback.POST(validFeedback, params)).status, 404)
storefront = { business: { id: "business-a" }, orderPersistence: "database" }
assert.equal((await feedback.POST(validFeedback, params)).status, 404)
assert.equal(feedbackScopes.at(-1)[3], "business-a")
assert.equal(feedbackScopes.at(-1)[1], "test-tracking-token")
accessibleOrder = { id: "order-a", status: "PREPARING" }
assert.equal((await feedback.POST(validFeedback, params)).status, 409)
accessibleOrder.status = "DELIVERED"
for (const body of [null, { rating: 0, comment: "" }, { rating: 6, comment: "" }, { rating: 1.5, comment: "" }, { rating: 4, comment: "x".repeat(2001) }]) {
  assert.equal((await feedback.POST(feedbackRequest(body), params)).status, 400)
}
assert.equal(writes, 0, "Ineligible or invalid feedback never reaches the database")
limited = true
assert.equal((await feedback.POST(validFeedback, params)).status, 429)
limited = false
const saved = await feedback.POST(validFeedback, params)
assert.equal(saved.body.feedback.rating, 5)
assert.equal((await feedback.GET(request, params)).body.eligible, true)
assert.equal((await feedback.POST(feedbackRequest({ rating: 1, comment: "Changed retry" }), params)).body.feedback.rating, 5)
console.log("PASS feedback requires hostname + order owner/guest authorization, completed order, rating/comment validation and rate limit; scoped reads and idempotent RPC used")
