// Actual route, domain resolver and email renderer. All I/O is replaced before
// loading them: no real auth, SMTP, Supabase, or customer data is used.
import assert from "node:assert/strict";
import vm from "node:vm";
import { fileURLToPath } from "node:url";
import { build } from "esbuild";

const admin = fileURLToPath(new URL("../", import.meta.url));
const output = await build({
  stdin: { contents: `export { POST, PATCH } from "./app/api/customer-broadcasts/route";
    export { sendCustomerBroadcast } from "./lib/email/customer-broadcast";
    export { resolveCustomerOrigin } from "./lib/customer-origin";`, resolveDir: admin },
  bundle: true, write: false, platform: "node", format: "cjs",
  plugins: [{ name: "no-external-io", setup(b) {
    b.onResolve({ filter: /^(server-only|nodemailer|next\/server|@\/lib\/auth|@\/lib\/supabase\/server)$/ }, args => ({ path: args.path, namespace: "mock" }));
    b.onLoad({ filter: /.*/, namespace: "mock" }, args => ({ contents: {
      "server-only": "",
      "nodemailer": "export default { createTransport() { globalThis.test.transports++; return { async sendMail(mail) { globalThis.test.mail.push(mail); if(globalThis.test.smtpFails) throw Error('DO NOT LEAK PROVIDER DETAILS'); return { messageId: 'fake-provider-id' }; }, close() { globalThis.test.closed++; } }; } };",
      "next/server": "export const NextResponse = { json: (...args) => Response.json(...args) };",
      "@/lib/auth": "export async function getAdminContext() { return globalThis.test.context; }",
      "@/lib/supabase/server": "export async function createClient() { return globalThis.test.db; }",
    }[args.path] }));
  } }],
});
const state = {};
const fakeEnv = { SMTP_HOST: "smtp.invalid", SMTP_USER: "sender@example.test", SMTP_PASSWORD: "fake-test-value", CUSTOMER_APP_URL: "https://wrong-restaurant.invalid" };
const sandbox = { module: { exports: {} }, test: state, URL, Request, Response, Headers, process: { env: fakeEnv }, console };
vm.runInNewContext(output.outputFiles[0].text, sandbox);
const { POST, PATCH, sendCustomerBroadcast, resolveCustomerOrigin } = sandbox.module.exports;
let checks = 0;
const pass = message => { checks++; console.log("PASS " + message); };
const campaignId = "11111111-1111-4111-8111-111111111111";
function reset() {
  Object.assign(state, { transports: 0, mail: [], closed: 0, smtpFails: false, queries: [], rpcs: [],
    context: { role: "OWNER", permissions: [], businessId: "business-a", businessName: "Restaurant A" },
    domain: { hostname: "RESTAURANT-A.Staging.QaziPro.com." }, resolvedBusiness: "business-a",
    domainError: false, brandingError: false, savedError: false, zeroSaved: false, totalsError: false, campaignSaveError: false,
    claimed: [{ delivery_id: 7, recipient: "manual@inbox.example.net" }], deliveries: [{ status: "SENT", attempts: 1 }],
  });
  state.db = {
    from(table) {
      const request = { table, filters: [], operation: "read" }; state.queries.push(request);
      const result = () => {
        if (table === "business_domains") return { data: state.domain, error: state.domainError ? {} : null };
        if (table === "business_branding") return { data: { logo_url: "/logo.png" }, error: state.brandingError ? {} : null };
        if (table === "customer_broadcasts") return request.operation === "update"
          ? { data: { id: campaignId }, error: state.campaignSaveError ? {} : null }
          : { data: { id: campaignId, subject: "Today's news", message: "Fresh menu", deal_id: null }, error: null };
        if (table === "customer_broadcast_deliveries") return request.operation === "update"
          ? { data: state.zeroSaved ? null : { id: 7 }, error: state.savedError ? {} : null }
          : { data: state.totalsError ? null : state.deliveries, error: state.totalsError ? {} : null };
        throw Error("Unexpected table: " + table);
      };
      const query = { select() { return query; }, eq(...args) { request.filters.push(args); return query; },
        not(...args) { request.filters.push(args); return query; }, update(value) { request.operation = "update"; request.value = value; return query; },
        maybeSingle() { return Promise.resolve(result()); }, then(resolve, reject) { return Promise.resolve(result()).then(resolve, reject); } };
      return query;
    },
    async rpc(name, args) {
      state.rpcs.push({ name, args });
      if (name === "resolve_storefront_business") return { data: [{ resolved_business_id: state.resolvedBusiness }], error: null };
      if (name === "claim_customer_broadcast_batch") return { data: state.claimed, error: null };
      throw Error("Unexpected RPC: " + name);
    },
  };
}
const patch = () => PATCH(new Request("https://admin.example.test/api/customer-broadcasts", { method: "PATCH", body: JSON.stringify({ id: campaignId }) }));
const email = { subject: "<Fresh & new>", message: "<script>bad</script>", restaurant: "Restaurant A", customerOrigin: "https://restaurant-a.staging.qazipro.com", logoUrl: "/logo.png" };
reset();
assert.equal(await resolveCustomerOrigin(state.db, "business-a"), email.customerOrigin);
assert.ok(state.queries[0].filters.some(([key, value]) => key === "business_id" && value === "business-a"));
assert.equal(state.rpcs[0].args.p_hostname, "restaurant-a.staging.qazipro.com");
pass("canonical active verified primary domain is normalized and checked by the storefront resolver");
for (const mode of ["missing", "query-error", "wrong-business", "inactive-or-disabled"]) {
  reset();
  if (mode === "missing") state.domain = null;
  if (mode === "query-error") state.domainError = true;
  if (mode === "wrong-business") state.resolvedBusiness = "business-b";
  if (mode === "inactive-or-disabled") state.resolvedBusiness = null;
  await assert.rejects(() => resolveCustomerOrigin(state.db, "business-a"));
}
pass("missing domain, query failure, cross-tenant resolution and unavailable storefront all fail closed");
reset();
const suppressed = await sendCustomerBroadcast(email, [{ deliveryId: 1, recipient: "qa-onboarding-1@staging.qazipro.invalid" }, { deliveryId: 2, recipient: "test@example.test" }, { deliveryId: 3, recipient: "person@arbitrary.invalid" }]);
assert.ok(suppressed.every(row => row.status === "SKIPPED")); assert.equal(state.transports, 0);
pass("all-synthetic batch creates no SMTP transport and sends no messages");
reset();
const mixed = await sendCustomerBroadcast(email, [{ deliveryId: 1, recipient: "qa-onboarding-1@staging.qazipro.invalid" }, { deliveryId: 2, recipient: "manual@inbox.example.net" }]);
assert.equal(mixed[1].status, "SENT"); assert.equal(state.mail.length, 1); assert.equal(state.closed, 1);
assert.ok(state.mail[0].html.includes('href="https://restaurant-a.staging.qazipro.com/"'));
assert.ok(state.mail[0].html.includes('src="https://restaurant-a.staging.qazipro.com/logo.png"'));
assert.ok(!state.mail[0].html.includes("wrong-restaurant")); assert.ok(!state.mail[0].html.includes("<script>"));
assert.ok(state.mail[0].html.includes("&lt;script&gt;"));
pass("mixed batch sends only eligible recipient; HTML is escaped and links/images use the restaurant origin");
reset();
await sendCustomerBroadcast({ ...email, customerOrigin: "http://localhost:3000" }, [{ deliveryId: 1, recipient: "manual@inbox.example.net" }]);
assert.equal(state.transports, 0);
pass("invalid customer origin fails without opening SMTP");
reset(); state.smtpFails = true;
const failed = await sendCustomerBroadcast(email, [{ deliveryId: 1, recipient: "manual@inbox.example.net" }]);
assert.equal(failed[0].status, "FAILED"); assert.ok(!failed[0].error.includes("DO NOT LEAK")); assert.equal(state.closed, 1);
pass("provider errors become actionable sanitized failure and transport is closed");
reset(); state.context = null;
assert.equal((await patch()).status, 403);
assert.equal((await POST(new Request("https://admin.example.test", { method: "POST", body: "{}" }))).status, 403);
assert.equal(state.queries.length, 0);
pass("unauthorized POST/PATCH never access the database or email provider");
reset(); state.context.role = "STAFF";
assert.equal((await patch()).status, 403);
pass("staff without content.manage cannot dispatch messages");
reset();
assert.equal((await POST(new Request("https://admin.example.test", { method: "POST", body: JSON.stringify({ subject: "Hello", message: "Fresh menu" }) }))).status, 400);
assert.equal(state.rpcs.length, 0);
pass("campaign creation without an idempotency key is rejected before database work");
for (const mode of ["domain", "branding"]) {
  reset(); if (mode === "domain") state.domain = null; else state.brandingError = true;
  assert.equal((await patch()).status, 409);
  assert.equal(state.rpcs.filter(row => row.name === "claim_customer_broadcast_batch").length, 0);
  assert.equal(state.mail.length, 0);
}
pass("invalid domain or unavailable branding never claims recipients or attempts email");
reset();
const success = await patch(); assert.equal(success.status, 200);
assert.equal((await success.json()).processed, 1); assert.equal(state.mail.length, 1);
assert.ok(state.queries.every(query => query.filters.some(([key, value]) => key === "business_id" && value === "business-a")));
const saved = state.queries.find(query => query.table === "customer_broadcast_deliveries" && query.operation === "update");
assert.ok(saved.filters.some(([key, value]) => key === "broadcast_id" && value === campaignId));
assert.ok(saved.filters.some(([key, value]) => key === "status" && value === "SENDING"));
pass("successful dispatch checks tenant/campaign/claimed state and confirms saved totals");
for (const field of ["savedError", "zeroSaved", "totalsError", "campaignSaveError"]) {
  reset(); state[field] = true;
  const response = await patch(); assert.ok(response.status >= 400);
  assert.ok((await response.json()).error); assert.equal(state.mail.length, 1);
}
pass("save errors, RLS zero-row updates and failed totals never report false success");
reset(); state.claimed = []; state.deliveries = [{ status: "SENDING", attempts: 1 }];
const waiting = await (await patch()).json();
assert.equal(waiting.processed, 0); assert.equal(waiting.remaining, 1); assert.equal(state.mail.length, 0);
pass("another worker's claimed batch is reported pending, not falsely completed");
console.log(`${checks} checks passed. Provider and DB are mocks: no real email or RLS acceptance claimed.`);
