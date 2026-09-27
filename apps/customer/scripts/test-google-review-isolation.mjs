// Actual route/provider/cache code; transports mocked, no external Google calls.
import assert from "node:assert/strict"
import { readFileSync } from "node:fs"
import { createRequire } from "node:module"
import vm from "node:vm"
const require = createRequire(import.meta.url)
const ts = require("typescript")
function load(path, imports) {
  const exports = {}
  const source = ts.transpileModule(readFileSync(new URL(path, import.meta.url), "utf8"), { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 } }).outputText
  vm.runInNewContext(source, { exports, URL, process: { env: { NODE_ENV: "production" } }, require: name => {
    if (name === "server-only") return {}
    if (name in imports) return imports[name]
    throw Error(`Unexpected dependency ${name}`)
  } })
  return exports
}
let providerCalls = 0, mismatch = false
class ServiceError extends Error {}
const details = load("../lib/google-places/place-details.ts", {
  "@/lib/google-places/client": { GooglePlacesServiceError: ServiceError, googlePlacesFetch: async url => {
    providerCalls++
    const place = decodeURIComponent(new URL(url).pathname.split("/").pop())
    return { id: place, displayName: { text: mismatch ? "Wrong business" : place === "place-a" ? "Restaurant A" : "Restaurant B" }, location: { latitude: 33, longitude: 73 }, rating: 4, userRatingCount: 10, reviews: [], googleMapsLinks: { placeUri: "https://evil.invalid/reviews" } }
  } },
})
const cache = load("../lib/google-places/cache.ts", { "@/lib/google-places/place-details": details })
let storefront = { orderPersistence: "database", business: { id: "a", name: "Restaurant A", reviewsEnabled: true }, branch: { id: "branch-a", googlePlaceId: "place-a", originLatitude: 33, originLongitude: 73 } }
const route = load("../app/api/google-reviews/route.ts", {
  "next/server": { NextResponse: { json: (body, options) => ({ body, ...options }) } },
  "@/lib/storefront/server": { getStorefrontSnapshot: async () => storefront },
  "@/lib/google-places/cache": cache,
})
const a = storefront
let response = await route.GET()
assert.equal(response.body.businessName, "Restaurant A")
assert.equal(response.body.googleMapsLinks.placeUri, null)
assert.equal(response.headers["Cache-Control"], "private, no-store")
storefront = { ...a, business: { ...a.business, id: "b", name: "Restaurant B" }, branch: { ...a.branch, id: "branch-b", googlePlaceId: "place-b" } }
assert.equal((await route.GET()).body.businessName, "Restaurant B")
storefront = a
assert.equal((await route.GET()).body.businessName, "Restaurant A")
assert.equal(providerCalls, 2)
console.log("PASS alternating tenants use isolated cached provider data; unsafe review links excluded")
storefront = { ...a, orderPersistence: "unavailable" }
assert.equal((await route.GET()).status, 404)
storefront = { ...a, branch: { ...a.branch, googlePlaceId: null } }
assert.equal((await route.GET()).body.code, "NOT_CONFIGURED")
storefront = { ...a, business: { ...a.business, reviewsEnabled: false } }
assert.equal((await route.GET()).body.code, "NOT_CONFIGURED")
assert.equal(providerCalls, 2)
console.log("PASS unavailable host, disabled reviews and unconfigured branch never contact provider")
mismatch = true
storefront = { ...a, branch: { ...a.branch, googlePlaceId: "changed-place" } }
response = await route.GET()
assert.equal(response.body.available, false)
assert.equal(response.body.code, "REVIEWS_UNAVAILABLE")
assert.equal(JSON.stringify(response.body).includes("Wrong business"), false)
assert.equal(providerCalls, 3)
console.log("PASS changed configuration invalidates cache; mismatched identity fails closed without provider details")
console.log("3 Google review isolation checks passed.")
