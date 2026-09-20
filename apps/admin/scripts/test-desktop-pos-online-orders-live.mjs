// Reversible API QA for the Electron live website-order boundary.
import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { existsSync, readFileSync } from "node:fs";
import { resolve } from "node:path";
import { pathToFileURL } from "node:url";
import { createClient } from "@supabase/supabase-js";
import { chromium } from "playwright";

const origin = process.argv[2] ?? "http://localhost:3101";
assert.equal(new URL(origin).hostname, "localhost");
const env = Object.fromEntries(
  readFileSync(new URL("../.env.local", import.meta.url), "utf8")
    .split(/\r?\n/)
    .filter((line) => /^[A-Z_]+=/.test(line))
    .map((line) => {
      const index = line.indexOf("=");
      return [
        line.slice(0, index),
        line
          .slice(index + 1)
          .trim()
          .replace(/^["']|["']$/g, ""),
      ];
    }),
);
const service = createClient(
  env.NEXT_PUBLIC_SUPABASE_URL,
  env.SUPABASE_SERVICE_ROLE_KEY,
  { auth: { persistSession: false, autoRefreshToken: false } },
);
const checked = (result, label) => {
  if (result.error) throw new Error(`${label}: ${result.error.message}`);
  return result.data;
};
const email = `qa-desktop-web-${randomUUID()}@example.test`,
  password = `Qa!${randomUUID()}`,
  orderNumber = `QA-WEB-${randomUUID()}`;
let userId, membershipId, orderId;
let failed = false;
let browser;
let posContext;

try {
  const branch = checked(
    await service
      .from("branches")
      .select("id,business_id")
      .eq("is_active", true)
      .limit(1)
      .single(),
    "Resolve branch",
  );
  const product = checked(
    await service
      .from("products")
      .select("id,name,base_price,sale_price")
      .eq("business_id", branch.business_id)
      .eq("is_active", true)
      .limit(1)
      .single(),
    "Resolve product",
  );
  userId = checked(
    await service.auth.admin.createUser({
      email,
      password,
      email_confirm: true,
      user_metadata: { full_name: "QA Desktop POS" },
    }),
    "Create cashier",
  ).user.id;
  membershipId = checked(
    await service
      .from("staff_memberships")
      .insert({
        business_id: branch.business_id,
        branch_id: branch.id,
        user_id: userId,
        role: "CASHIER",
        is_active: true,
        permissions_customized: true,
      })
      .select("id")
      .single(),
    "Create membership",
  ).id;
  checked(
    await service
      .from("staff_membership_permissions")
      .insert(
        [
          "desktop_pos.use",
          "pos.use",
          "orders.read",
          "orders.manage",
          "receipts.print",
        ].map((permission_code) => ({
          membership_id: membershipId,
          permission_code,
        })),
      ),
    "Assign Desktop POS core",
  );
  const price = Number(product.sale_price ?? product.base_price);
  orderId = checked(
    await service
      .from("orders")
      .insert({
        order_number: orderNumber,
        business_id: branch.business_id,
        branch_id: branch.id,
        channel: "WEBSITE",
        operational_order_type: "PICKUP",
        service_mode: "PICKUP",
        status: "RECEIVED",
        payment_method: "CASH_ON_DELIVERY",
        payment_status: "UNPAID",
        customer_id: userId,
        customer_name: "QA Website Customer",
        customer_phone: "03000000000",
        customer_email: "restaurant-owner@example.invalid",
        subtotal: price,
        total: price,
      })
      .select("id")
      .single(),
    "Create website order",
  ).id;
  checked(
    await service
      .from("order_items")
      .insert({
        order_id: orderId,
        product_id: product.id,
        product_name: product.name,
        quantity: 1,
        unit_base_price: price,
        unit_modifier_price: 0,
        unit_price: price,
        line_total: price,
      }),
    "Create order item",
  );
  const cashier = createClient(
    env.NEXT_PUBLIC_SUPABASE_URL,
    env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY,
    { auth: { persistSession: false, autoRefreshToken: false } },
  );
  const session = checked(
    await cashier.auth.signInWithPassword({ email, password }),
    "Sign in Desktop cashier",
  ).session;
  const headers = {
    Authorization: `Bearer ${session.access_token}`,
    "Content-Type": "application/json",
  };
  const loaded = await fetch(
    `${origin}/api/desktop-pos/orders?branch=${branch.id}`,
    { headers },
  );
  assert.equal(loaded.status, 200);
  const list = await loaded.json();
  const visible = list.orders.find((order) => order.id === orderId);
  assert.equal(visible.order_items[0].product_name, product.name);
  const installedChrome = [
    "C:/Program Files/Google/Chrome/Application/chrome.exe",
    "C:/Program Files (x86)/Google/Chrome/Application/chrome.exe",
  ].find(existsSync);
  browser = await chromium.launch({
    headless: true,
    ...(installedChrome ? { executablePath: installedChrome } : {}),
  });
  const renderer = await browser.newPage();
  await renderer.goto(
    pathToFileURL(resolve("apps/desktop-pos/dist/index.html")).href,
    { waitUntil: "domcontentloaded" },
  );
  const electronBoundary = await renderer.evaluate(
    async ({ apiOrigin, branchId, accessToken, expectedOrderId }) => {
      try {
        const response = await fetch(
          `${apiOrigin}/api/desktop-pos/orders?branch=${encodeURIComponent(branchId)}`,
          { headers: { Authorization: `Bearer ${accessToken}` } },
        );
        const body = await response.json();
        return {
          ok: response.ok,
          status: response.status,
          visible: body.orders?.some(order => order.id === expectedOrderId) ?? false,
          error: body.error ?? "",
        };
      } catch (error) {
        return { ok: false, status: 0, visible: false, error: String(error) };
      }
    },
    {
      apiOrigin: origin.replace("http://localhost:", "http://127.0.0.1:"),
      branchId: branch.id,
      accessToken: session.access_token,
      expectedOrderId: orderId,
    },
  );
  assert.equal(electronBoundary.status, 200, JSON.stringify(electronBoundary));
  assert.equal(electronBoundary.visible, true, "Electron file-origin renderer must receive the live website order");
  posContext = await browser.newContext({ viewport: { width: 1440, height: 900 } });
  const projectRef = new URL(env.NEXT_PUBLIC_SUPABASE_URL).hostname.split(".")[0];
  await posContext.addInitScript(({ key, value }) => localStorage.setItem(key, JSON.stringify(value)), { key: `sb-${projectRef}-auth-token`, value: session });
  const pos = await posContext.newPage();
  const posErrors = [];
  const posNetwork = [];
  pos.on("pageerror", error => posErrors.push(error.message));
  pos.on("requestfailed", request => { if(request.url().includes("/api/desktop-pos/")) posNetwork.push({url:request.url(),failure:request.failure()?.errorText}) });
  pos.on("response", response => { if(response.url().includes("/api/desktop-pos/")) posNetwork.push({url:response.url(),status:response.status()}) });
  await pos.goto("http://localhost:5173", { waitUntil: "domcontentloaded", timeout: 120000 });
  await pos.getByRole("heading", { name: "Choose restaurant" }).waitFor({ timeout: 30000 });
  await pos.locator(".login-card > button:not(.logout-button)").first().click();
  await pos.getByRole("heading", { name: "Open counter shift" }).waitFor({ timeout: 30000 });
  await pos.getByRole("button", { name: "Open shift" }).click();
  try { await pos.locator(".pos-app").waitFor({ timeout: 20000 }); }
  catch { throw new Error(`Desktop catalog did not open. Screen: ${(await pos.locator("body").innerText()).slice(0,900)} Network: ${JSON.stringify(posNetwork)} Page errors: ${JSON.stringify(posErrors)}`) }
  const incoming = pos.locator(`[data-incoming-website-order="${orderId}"]`);
  try { await incoming.waitFor({ timeout: 30000 }); }
  catch { throw new Error(`Desktop order card missing. Notice: ${await pos.locator(".notice").allTextContents()} Network: ${JSON.stringify(posNetwork)} Page errors: ${JSON.stringify(posErrors)}`) }
  assert.equal(await incoming.getByRole("button", { name: "Confirm order" }).count(), 1);
  assert.equal(await incoming.getByRole("button", { name: "Cancel" }).count(), 1);
  const incomingColors = await incoming.locator("button").evaluateAll(buttons => buttons.map(button => getComputedStyle(button).backgroundColor));
  assert.notEqual(incomingColors[0], incomingColors[1], "Cancel and Confirm must have distinct full colours");
  assert.equal(incomingColors[0], "rgb(198, 40, 40)", "Website cancel must be red");
  assert.equal(incomingColors[1], "rgb(22, 134, 83)", "Website confirmation must be green");
  await incoming.getByRole("button", { name: "Confirm order" }).click();
  await incoming.waitFor({ state: "detached", timeout: 30000 });
  let confirmedStatus = "RECEIVED";
  for (let attempt = 0; attempt < 40 && confirmedStatus !== "CONFIRMED"; attempt++) {
    await new Promise(resolve => setTimeout(resolve, 250));
    confirmedStatus = checked(await service.from("orders").select("status").eq("id", orderId).single(), "Wait for UI confirmation").status;
  }
  assert.equal(confirmedStatus, "CONFIRMED", `Desktop confirmation did not persist. Network: ${JSON.stringify(posNetwork)}`);
  assert.deepEqual(posErrors, []);
  assert.equal(
    checked(
      await service.from("orders").select("status,customer_email").eq("id", orderId).single(),
      "Verify status",
    ).customer_email,
    email,
  );
  const savedOrder = checked(
    await service.from("orders").select("status,customer_email").eq("id", orderId).single(),
    "Verify customer recipient",
  );
  assert.equal(savedOrder.status, "CONFIRMED");
  assert.equal(savedOrder.customer_email, email);
  let queued = [];
  for (let attempt = 0; attempt < 40; attempt++) {
    queued = checked(await service.from("order_notifications").select("recipient,status").eq("order_id", orderId), "Verify confirmation recipient");
    if (queued.length && queued.every(item => item.status !== "SENDING")) break;
    await new Promise(resolve => setTimeout(resolve, 250));
  }
  assert.equal(queued.length, 1);
  assert.equal(queued[0].recipient, email);
  assert.ok(["PENDING", "SENT", "SKIPPED"].includes(queued[0].status), `Unexpected notification status: ${queued[0].status}`);
  await service
    .from("staff_membership_permissions")
    .delete()
    .eq("membership_id", membershipId)
    .eq("permission_code", "desktop_pos.use");
  const revoked = await fetch(
    `${origin}/api/desktop-pos/orders?branch=${branch.id}`,
    { headers },
  );
  assert.equal(
    revoked.status,
    403,
    "Revoked Desktop grant must immediately block the Electron order API",
  );
  console.log(
    "PASS: Desktop POS showed a persistent website-order action card, confirmed it from the sale screen, and lost access immediately after its dedicated grant was revoked.",
  );
} catch (error) {
  failed = true;
  console.error(
    `FAIL: ${error instanceof Error ? error.message : "Desktop website-order verification failed"}`,
  );
} finally {
  await posContext?.close();
  await browser?.close();
  if (orderId) {
    await service.from("audit_logs").delete().eq("entity_id", orderId);
    await service.from("notifications").delete().eq("entity_id", orderId);
    await service.from("order_notifications").delete().eq("order_id", orderId);
    await service.from("orders").delete().eq("id", orderId);
  }
  if (membershipId)
    await service
      .from("staff_membership_permissions")
      .delete()
      .eq("membership_id", membershipId);
  if (userId) {
    await service.from("staff_memberships").delete().eq("user_id", userId);
    await service.from("audit_logs").delete().eq("actor_id", userId);
    await service.auth.admin.deleteUser(userId);
  }
  console.log("Disposable Desktop POS website-order fixtures removed.");
}
if (failed) process.exitCode = 1;
