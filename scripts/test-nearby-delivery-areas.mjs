import assert from "node:assert/strict"
import { build } from "esbuild"
import { readFile } from "node:fs/promises"
import { parseEnv } from "node:util"
const bundle = await build({ entryPoints: ["packages/shared/src/nearby-delivery-areas.ts"], bundle: true, platform: "node", format: "esm", write: false })
const { discoverNearbyDeliveryAreas: discover, syncNearbyDeliveryAreas: sync } = await import(`data:text/javascript;base64,${Buffer.from(bundle.outputFiles[0].text).toString("base64")}`)
const point = { latitude: 33.6844, longitude: 73.0479 }
const row = (id, latitude = point.latitude, name = `Locality ${id}`) => ({ properties: { place_id: id, name, city: "Neighbouring town", district: "Parent district", lat: latitude, lon: point.longitude, categories: ["populated_place.village"], country_code: "pk" } })
let checks = 0
const pass = name => { checks++; console.log(`PASS ${name}`) }
const requests = []
const fetcher = async (url, init) => {
  requests.push({ url, init })
  return Response.json({ features: [row("a"), row("a"), row("b", 33.73), row("outside", 34), { properties: { name: "Invalid" } }] })
}
const candidates = await discover(point, "unit-test-key", fetcher)
assert.deepEqual(candidates.map(item => item.providerPlaceId), ["a", "b"])
assert.equal(candidates[0].name, "Locality a")
pass("8 km geometry, neighbouring city retained, actual place name, deduplication, malformed rows rejected")
assert.equal(requests[0].url.searchParams.get("filter"), "circle:73.0479,33.6844,8000")
assert.equal(requests[0].url.searchParams.has("apiKey"), false)
pass("radius is fixed in metres; credential absent from URL")
let pages = 0
const paginated = await discover(point, "unit-test-key", async url => {
  const offset = Number(url.searchParams.get("offset")); pages++
  return Response.json({ features: offset === 0 ? Array.from({ length: 500 }, (_, i) => row(String(i))) : [row("last")] })
})
assert.equal(pages, 2); assert.equal(paginated.length, 501)
pass("provider pagination includes results beyond first page")
await assert.rejects(discover({ latitude: NaN, longitude: 1 }, "key", fetcher))
await assert.rejects(discover(point, "", fetcher))
await assert.rejects(discover(point, "key", async () => new Response(null, { status: 429 })))
pass("invalid coordinates, missing configuration and provider rate limits fail honestly")
const noPin = await sync({ readBranch: async () => ({ id: "branch", latitude: null, longitude: null }), importAreas: () => { throw Error("must not import") } }, "key")
assert.equal(noPin.ok, false); assert.match(noPin.message, /map pin/)
pass("address without verified coordinates cannot populate arbitrary areas")
const failure = await sync({ readBranch: async () => { throw Error("internal secret") }, importAreas: () => 0 }, "key")
assert.equal(failure.ok, false); assert.doesNotMatch(failure.message, /internal secret/)
pass("saved branch survives discovery failure with safe retry message")
if (process.argv.includes("--live")) {
  const env = parseEnv(await readFile("apps/admin/.env.local", "utf8"))
  assert.equal(env.NEXT_PUBLIC_SUPABASE_URL, "https://jzisqjvroxodvmqxzsob.supabase.co")
  const live = await discover(point, env.GEOAPIFY_API_KEY ?? "")
  assert.ok(live.length > 0)
  console.log(`PASS live Geoapify read-only discovery: ${live.length} mapped localities inside 8 km. No database writes.`)
}
console.log(`${checks} checks passed.`)
