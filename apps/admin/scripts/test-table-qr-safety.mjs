import assert from "node:assert/strict"
import { build } from "esbuild"
import { fileURLToPath } from "node:url"
import vm from "node:vm"
const admin = fileURLToPath(new URL("../", import.meta.url))
const compiled = await build({ stdin: { contents: 'export { getTableQr, TableQrConfigurationError } from "./lib/table-qr";', resolveDir: admin }, tsconfig: admin + "tsconfig.json", bundle: true, write: false, platform: "node", format: "cjs", plugins: [{ name: "isolated", setup(b) {
  b.onResolve({ filter: /^(server-only|@\/lib\/(auth|supabase\/server|customer-origin))$/ }, args => ({ path: args.path, namespace: "mock" }))
  b.onLoad({ filter: /.*/, namespace: "mock" }, args => ({ contents: {
    "server-only": "",
    "@/lib/auth": "export async function requirePermission(permission) { test.permission=permission; if(test.denied) throw test.redirect; return {businessId:'business-a',businessName:'Restaurant A'}; }",
    "@/lib/supabase/server": "export async function createClient() { return test.db; }",
    "@/lib/customer-origin": "export async function resolveCustomerOrigin() { test.resolutions++; if(test.domainError) throw Error('private provider detail'); return 'https://restaurant-a.staging.qazipro.com'; }",
  }[args.path] }))
} }] })
const test = { denied: false, redirect: new Error("auth redirect"), domainError: false, resolutions: 0, filters: [], table: { id: "11111111-1111-4111-8111-111111111111", name: "Table 1", public_token: "a".repeat(48) } }
test.db = { from(table) { assert.equal(table, "restaurant_tables"); const query = { select: () => query, eq: (key, value) => { test.filters.push([key, value]); return query }, maybeSingle: async () => ({ data: test.table, error: null }) }; return query } }
const sandbox = { module: { exports: {} }, test }
vm.runInNewContext(compiled.outputFiles[0].text, sandbox)
const { getTableQr, TableQrConfigurationError } = sandbox.module.exports
const id = test.table.id
let result = await getTableQr(id)
assert.equal(test.permission, "settings.manage")
assert.equal(result.url, `https://restaurant-a.staging.qazipro.com/t/${"a".repeat(48)}`)
assert.ok(test.filters.some(([key, value]) => key === "business_id" && value === "business-a"))
test.domainError = true
await assert.rejects(getTableQr(id), error => error instanceof TableQrConfigurationError && !error.message.includes("private provider"))
test.denied = true
await assert.rejects(getTableQr(id), error => error === test.redirect)
test.denied = false; test.table = null
assert.equal(await getTableQr(id), null)
assert.equal(await getTableQr("not-an-id"), null)
console.log("PASS QR uses permission + tenant-scoped session query, canonical origin, sanitized configuration errors, preserved auth redirects, missing/invalid table rejection (5 checks).")
