import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { chromium } from "playwright";
import { createClient } from "@supabase/supabase-js";
import { createServerClient } from "@supabase/ssr";

process.loadEnvFile(new URL("../../backend/.env.local", import.meta.url));
const env = process.env;
const db = createClient(
  env.NEXT_PUBLIC_SUPABASE_URL,
  env.SUPABASE_SERVICE_ROLE_KEY,
  { auth: { persistSession: false, autoRefreshToken: false } },
);
const check = (result, label) => {
  if (result.error)
    throw new Error(`${label}: ${result.error.code} ${result.error.message}`);
  return result.data;
};
const cookieClient = async (name, email, password) => {
  const jar = new Map();
  const client = createServerClient(
    env.NEXT_PUBLIC_SUPABASE_URL,
    env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY,
    {
      cookieOptions: { name, path: "/", sameSite: "lax" },
      cookies: {
        getAll: () =>
          [...jar].map(([cookieName, value]) => ({ name: cookieName, value })),
        setAll: (items) =>
          items.forEach(({ name: cookieName, value }) =>
            jar.set(cookieName, value),
          ),
      },
    },
  );
  check(
    await client.auth.signInWithPassword({ email, password }),
    `${name} sign in`,
  );
  return { client, jar };
};
const browser = await chromium.launch({ channel: "chrome", headless: true });
let ownerId,
  customerId,
  trackingOrderId,
  posOrderId,
  replacementId,
  shiftId,
  invoiceId,
  businessId,
  riderSettingSnapshot,
  failed = false;
try {
  const branch = check(
    await db
      .from("branches")
      .select("id,business_id,name,restaurant_name,city")
      .eq("is_active", true)
      .order("sort_order")
      .limit(1)
      .single(),
    "active branch",
  );
  businessId = branch.business_id;
  riderSettingSnapshot = check(
    await db.from("business_operating_settings").select("rider_portal_enabled").eq("business_id", businessId).single(),
    "rider setting snapshot",
  );
  check(
    await db.from("business_operating_settings").update({ rider_portal_enabled: false }).eq("business_id", businessId),
    "disable rider portal for the normal Admin delivery-flow test",
  );
  const product = check(
    await db
      .from("products")
      .select("id,name")
      .eq("business_id", branch.business_id)
      .eq("is_active", true)
      .eq("is_available", true)
      .order("sort_order")
      .limit(1)
      .single(),
    "sellable product",
  );
  const area = check(
    await db
      .from("delivery_areas")
      .select("id,name")
      .eq("branch_id", branch.id)
      .eq("is_active", true)
      .order("sort_order")
      .limit(1)
      .single(),
    "active delivery area",
  );
  const deals = check(
    await db
      .from("deals")
      .select("id,name,deal_price")
      .eq("business_id", branch.business_id)
      .eq("is_active", true)
      .order("sort_order")
      .limit(2),
    "active deals",
  );
  assert.ok(deals.length >= 2, "POS replacement QA requires two active deals");
  const [deal, replacementDeal] = deals;
  const ownerEmail = `qa-ops-owner-${randomUUID()}@example.test`,
    customerEmail = `qa-ops-customer-${randomUUID()}@example.test`,
    password = `Qa!${randomUUID()}a9`;
  ownerId = check(
    await db.auth.admin.createUser({
      email: ownerEmail,
      password,
      email_confirm: true,
    }),
    "owner user",
  ).user.id;
  customerId = check(
    await db.auth.admin.createUser({
      email: customerEmail,
      password,
      email_confirm: true,
      user_metadata: { full_name: "QA TEST DO NOT FULFILL" },
    }),
    "customer user",
  ).user.id;
  check(
    await db
      .from("staff_memberships")
      .insert({
        business_id: branch.business_id,
        user_id: ownerId,
        role: "OWNER",
        is_active: true,
      }),
    "owner membership",
  );
  const ownerAuth = await cookieClient(
      "italian-pizza-admin-auth",
      ownerEmail,
      password,
    ),
    customerAuth = await cookieClient(
      "italian-pizza-customer-auth",
      customerEmail,
      password,
    );
  const ownerContext = await browser.newContext({
      viewport: { width: 1440, height: 1000 },
    }),
    customerContext = await browser.newContext({
      viewport: { width: 390, height: 844 },
    });
  await ownerContext.addCookies(
    [...ownerAuth.jar].map(([name, value]) => ({
      name,
      value,
      domain: "localhost",
      path: "/",
      sameSite: "Lax",
    })),
  );
  await ownerContext.addCookies([
    {
      name: "ip-admin-branch",
      value: branch.id,
      domain: "localhost",
      path: "/",
      sameSite: "Lax",
    },
  ]);
  await customerContext.addCookies(
    [...customerAuth.jar].map(([name, value]) => ({
      name,
      value,
      domain: "localhost",
      path: "/",
      sameSite: "Lax",
    })),
  );
  const admin = await ownerContext.newPage(),
    customer = await customerContext.newPage();

  await admin.goto("http://localhost:3001/orders", {
    waitUntil: "domcontentloaded",
    timeout: 90000,
  });
  const replacementWindowInput = admin.getByLabel("POS replacement window in minutes");
  await replacementWindowInput.waitFor();
  const configuredWindow = await replacementWindowInput.inputValue();
  await replacementWindowInput.fill(configuredWindow);
  await admin.getByRole("button", { name: "Save time" }).click();
  await admin.getByText(`POS replacement window saved as ${configuredWindow} minutes.`).waitFor();
  console.log("PASS POS replacement window is editable from Orders and persists through authenticated RLS");

  await admin.goto("http://localhost:3001/menu", {
    waitUntil: "domcontentloaded",
    timeout: 90000,
  });
  await admin.getByRole("heading", { name: "Products", exact: true }).waitFor();
  assert.ok((await admin.locator(".product-admin-card").count()) >= 1);
  assert.equal(
    await admin
      .locator(".product-admin-card")
      .first()
      .getByText(/^[0-9a-f]{8}-/)
      .count(),
    0,
  );
  await admin.emulateMedia({ reducedMotion: "reduce" });
  const adminSpinner = await admin.evaluate(async () => {
    const shell = document.createElement("span");
    shell.className = "app-loader";
    shell.innerHTML = "<i></i>";
    document.body.append(shell);
    const spinner = shell.firstElementChild;
    await new Promise((resolve) => setTimeout(resolve, 80));
    const animation = spinner.getAnimations()[0];
    const before = Number(animation?.currentTime ?? 0);
    const duration = getComputedStyle(spinner).animationDuration;
    const iterations = getComputedStyle(spinner).animationIterationCount;
    await new Promise((resolve) => setTimeout(resolve, 300));
    const after = Number(animation?.currentTime ?? 0);
    shell.remove();
    return { before, after, duration, iterations };
  });
  assert.ok(adminSpinner.after > adminSpinner.before);
  assert.equal(adminSpinner.iterations, "infinite");
  await admin.emulateMedia({ reducedMotion: "no-preference" });
  console.log(
    "PASS products are category-grouped, no raw category UUID is shown, and Admin loader rotates under reduced-motion settings",
  );
  await admin.goto("http://localhost:3001/modifiers", {
    waitUntil: "domcontentloaded",
    timeout: 90000,
  });
  await admin
    .getByRole("heading", { name: "Options & Add-ons", exact: true })
    .waitFor();
  assert.equal(await admin.locator(".options-explainer article").count(), 3);
  console.log("PASS Options & Add-ons teaching UI and reusable groups render");
  const shift = check(
    await ownerAuth.client.rpc("open_pos_shift", {
      p_branch_id: branch.id,
      p_opening_cash: 0,
    }),
    "open POS shift",
  );
  shiftId = shift.id;
  await admin.goto("http://localhost:3001/pos", {
    waitUntil: "domcontentloaded",
    timeout: 90000,
  });
  await admin
    .getByRole("heading", { name: "Point of sale", exact: true })
    .waitFor();
  assert.ok((await admin.locator(".pos-products button").count()) >= 1);
  await admin.getByRole("button", { name: "Deals", exact: true }).click();
  await admin.getByText(deal.name, { exact: true }).first().waitFor();
  console.log(
    "PASS POS All catalog and live Deals tab render real database items",
  );
  const pos = check(
    await ownerAuth.client.rpc("create_pos_order", {
      p_payload: {
        branchId: branch.id,
        shiftId,
        clientReference: randomUUID(),
        orderType: "TAKEAWAY",
        customerName: "QA TEST DO NOT FULFILL",
        customerPhone: "Counter",
        notes: "Automated operations verification",
        cashReceived: 100000,
        items: [
          { itemKind: "deal", productId: deal.id, quantity: 1, modifiers: [] },
        ],
      },
    }),
    "POS authoritative sale",
  );
  posOrderId = pos.id;
  const posSaved = check(
    await db
      .from("orders")
      .select("channel,payment_status,total")
      .eq("id", posOrderId)
      .single(),
    "saved POS order",
  );
  assert.equal(posSaved.channel, "POS");
  assert.equal(posSaved.payment_status, "PAID");
  assert.equal(posSaved.total, deal.deal_price);
  console.log(
    "PASS POS deal sale, authoritative price, payment and order persistence",
  );
  await admin.goto(`http://localhost:3001/pos?replace=${posOrderId}`, {
    waitUntil: "domcontentloaded",
    timeout: 90000,
  });
  await admin
    .getByRole("heading", { name: "Replace POS order items", exact: true })
    .waitFor();
  await admin.getByLabel("Replacement reason").waitFor();
  console.log("PASS eligible recent POS sale opens the replacement editor");
  await admin.getByRole("button", { name: `Remove ${deal.name}` }).click();
  await admin
    .locator(".pos-products button")
    .filter({ hasText: replacementDeal.name })
    .first()
    .click();
  await admin.getByLabel("Replacement reason").fill("Customer changed meal before preparation");
  await admin.getByRole("button", { name: "Review replacement" }).click();
  if (replacementDeal.deal_price > deal.deal_price)
    await admin.getByRole("button", { name: "Exact cash" }).click();
  const replacementResponse = admin.waitForResponse(
    (response) => response.url().includes("/rpc/replace_pos_order"),
  );
  await admin.getByRole("button", { name: "Save replacement & print" }).click();
  const response = await replacementResponse;
  await admin.getByText("Receipt ready", { exact: true }).waitFor({ timeout: 30000 });
  assert.equal(response.status(), 200, await response.text());
  const replacementRecord = check(
    await db
      .from("pos_order_replacements")
      .select("id")
      .eq("order_id", posOrderId)
      .single(),
    "replacement record",
  );
  replacementId = replacementRecord.id;
  const replaced = check(
    await db
      .from("orders")
      .select("total,payment_status,order_items(product_name,deal_id)")
      .eq("id", posOrderId)
      .single(),
    "replaced POS order",
  );
  assert.equal(replaced.total, replacementDeal.deal_price);
  assert.equal(replaced.payment_status, "PAID");
  assert.equal(replaced.order_items.length, 1);
  assert.equal(replaced.order_items[0].deal_id, replacementDeal.id);
  const replacementAudit = check(
    await db
      .from("pos_order_replacements")
      .select("old_total,new_total,cash_adjustment,old_items,new_items")
      .eq("id", replacementId)
      .single(),
    "replacement audit",
  );
  assert.equal(replacementAudit.old_total, deal.deal_price);
  assert.equal(replacementAudit.new_total, replacementDeal.deal_price);
  assert.ok(
    replacementAudit.old_items.length === 1 &&
      replacementAudit.new_items.length === 1,
  );
  const payments = check(
    await db
      .from("payment_transactions")
      .select("amount")
      .eq("order_id", posOrderId),
    "replacement payments",
  );
  const refunds = check(
    await db
      .from("refunds")
      .select("amount")
      .eq("order_id", posOrderId)
      .eq("status", "SUCCEEDED"),
    "replacement refunds",
  );
  assert.equal(
    payments.reduce((sum, row) => sum + row.amount, 0) -
      refunds.reduce((sum, row) => sum + row.amount, 0),
    replacementDeal.deal_price,
  );
  const duplicate = await ownerAuth.client.rpc("replace_pos_order", {
    p_order_id: posOrderId,
    p_payload: {
      branchId: branch.id,
      shiftId,
      reason: "Duplicate replacement attempt",
      cashReceived: 100000,
      items: [
        { itemKind: "deal", productId: deal.id, quantity: 1, modifiers: [] },
      ],
    },
  });
  assert.ok(duplicate.error);
  console.log(
    "PASS POS-only one-time replacement, authoritative repricing, cash adjustment and immutable audit snapshot",
  );

  await admin.goto("http://localhost:3001/printing", {
    waitUntil: "domcontentloaded",
    timeout: 90000,
  });
  await admin
    .getByRole("heading", { name: "Invoice & Printing", exact: true })
    .waitFor();
  await admin
    .getByText(branch.restaurant_name, { exact: true })
    .first()
    .waitFor();
  assert.equal(
    await admin.getByText("Italian Pizza", { exact: true }).count(),
    0,
  );
  await admin.evaluate(() => {
    window.__qaPrintCalls = 0;
    window.print = () => window.__qaPrintCalls++;
  });
  await admin.getByRole("button", { name: "Print test receipt" }).click();
  await admin.waitForFunction(() => window.__qaPrintCalls === 1);
  console.log(
    "PASS dynamic branch receipt identity, live preview and browser print invocation",
  );
  await admin.goto("http://localhost:3001/invoices", {
    waitUntil: "domcontentloaded",
    timeout: 90000,
  });
  await admin.getByRole("heading", { name: "Invoices", exact: true }).waitFor();
  await admin.getByRole("button", { name: "Order invoices" }).waitFor();
  await admin.getByRole("button", { name: "Manual invoices" }).waitFor();
  await admin.getByRole("button", { name: "New manual invoice" }).click();
  await admin.locator(".invoice-manual-editor").waitFor();
  console.log("PASS invoice type tabs and dedicated manual invoice editor");
  const manual = check(
    await ownerAuth.client.rpc("save_invoice", {
      p_business_id: branch.business_id,
      p_id: null,
      p_draft: {
        client_reference: randomUUID(),
        invoice_date: "2026-09-09",
        branch_id: branch.id,
        customer_name: "QA TEST DO NOT FULFILL",
        customer_phone: "03000000002",
        customer_email: "",
        billing_address: "",
        discount: 0,
        tax: 0,
        charges: 0,
        notes: "Automated verification",
        terms: "",
        lines: [
          {
            description: "QA catering item",
            quantity: 2,
            unit_price: 500,
            discount: 0,
            tax: 0,
          },
        ],
      },
    }),
    "manual invoice",
  );
  invoiceId = manual;
  const invoice = check(
    await ownerAuth.client.rpc("invoice_document", { p_id: invoiceId }),
    "manual invoice document",
  );
  assert.equal(invoice.total, 1000);
  console.log(
    "PASS manual invoice totals use the existing invoice/payment ledger",
  );

  const orderNumber = `QA-TRACK-${Date.now()}`;
  const tracking = check(
    await db
      .from("orders")
      .insert({
        order_number: orderNumber,
        business_id: branch.business_id,
        branch_id: branch.id,
        customer_id: customerId,
        service_mode: "DELIVERY",
        customer_name: "QA TEST DO NOT FULFILL",
        customer_phone: "03000000003",
        customer_email: customerEmail,
        delivery_area_id: area.id,
        delivery_area_name: area.name,
        delivery_address: `QA address, ${area.name}, ${branch.city}`,
        subtotal: 500,
        total: 500,
      })
      .select("id,token_number")
      .single(),
    "tracking order",
  );
  trackingOrderId = tracking.id;
  check(
    await db
      .from("order_items")
      .insert({
        order_id: trackingOrderId,
        product_id: product.id,
        product_name: product.name,
        quantity: 1,
        unit_base_price: 500,
        unit_price: 500,
        line_total: 500,
      }),
    "tracking order item",
  );
  await admin.goto(
    `http://localhost:3001/customers?q=${encodeURIComponent(customerEmail)}`,
    { waitUntil: "domcontentloaded", timeout: 90000 },
  );
  let row = admin.locator("tr").filter({ hasText: customerEmail });
  await row.getByRole("button", { name: "Block" }).waitFor();
  check(
    await ownerAuth.client.rpc("set_customer_restriction", {
      p_business_id: branch.business_id,
      p_auth_user_id: customerId,
      p_email: customerEmail,
      p_phone: "03000000003",
      p_blocked: true,
      p_reason_code: "REPEATED_FAKE_ORDERS",
      p_internal_note: "QA automated restriction",
      p_prevent_new_orders: true,
      p_prevent_storefront_access: true,
    }),
    "block customer",
  );
  await admin.reload({ waitUntil: "domcontentloaded" });
  row = admin.locator("tr").filter({ hasText: customerEmail });
  await row.getByText("BLOCKED", { exact: true }).waitFor();
  console.log(
    "PASS customer block action, server RPC and Admin blocked status",
  );
  await customer.goto("http://localhost:3000", {
    waitUntil: "domcontentloaded",
    timeout: 90000,
  });
  await customer
    .getByRole("heading", { name: "Account access restricted" })
    .waitFor();
  const denied = await customerContext.request.patch(
    "http://localhost:3000/api/profile",
    { data: { fullName: "Blocked edit" } },
  );
  assert.equal(denied.status(), 403);
  console.log(
    "PASS blocked signed-in storefront and direct account API denial",
  );
  check(
    await ownerAuth.client.rpc("set_customer_restriction", {
      p_business_id: branch.business_id,
      p_auth_user_id: customerId,
      p_email: customerEmail,
      p_phone: "03000000003",
      p_blocked: false,
      p_reason_code: "OTHER",
      p_internal_note: null,
      p_prevent_new_orders: true,
      p_prevent_storefront_access: true,
    }),
    "unblock customer",
  );
  await admin.reload({ waitUntil: "domcontentloaded" });
  row = admin.locator("tr").filter({ hasText: customerEmail });
  await row.getByText("ACTIVE", { exact: true }).waitFor();
  await customer.reload({ waitUntil: "domcontentloaded" });
  await customer
    .getByRole("heading", { name: "Where would you like to order?" })
    .waitFor();
  console.log("PASS unblock restores storefront access");

  await customer.getByRole("button", { name: "Pickup", exact: true }).click();
  await customer.getByRole("button", { name: "Start ordering" }).click();
  await customer.locator("dialog.location-dialog").waitFor({ state: "hidden" });
  await customer
    .locator(".product-card:visible")
    .filter({ hasText: product.name })
    .first()
    .waitFor();
  await customer.reload({ waitUntil: "domcontentloaded" });
  await customer.locator(".location-boot-guard").waitFor({ state: "hidden" });
  assert.equal(
    await customer.locator("dialog[open].location-dialog").count(),
    0,
  );
  console.log(
    "PASS mandatory first-load gate accepts pickup and persists a valid selection",
  );
  await customer.evaluate(() => {
    const key = "italian-pizza-demo-state-v2",
      value = JSON.parse(localStorage.getItem(key));
    value.locationRevision = 0;
    localStorage.setItem(key, JSON.stringify(value));
  });
  await customer.reload({ waitUntil: "domcontentloaded" });
  await customer
    .getByRole("heading", { name: "Where would you like to order?" })
    .waitFor();
  console.log("PASS stale location revision reopens the mandatory gate");
  await customer.getByRole("button", { name: "Pickup", exact: true }).click();
  await customer.getByRole("button", { name: "Start ordering" }).click();
  const card = customer
    .locator(".product-card:visible")
    .filter({ hasText: product.name })
    .first();
  await card.getByRole("button", { name: "Add" }).click();
  if (await customer.locator(".customization-dialog[open]").count()) {
    assert.ok(
      (await customer
        .locator(".customization-options")
        .getByText(/Choose size|Choose crust|Add extras/i)
        .count()) >= 1,
    );
    await customer.getByRole("button", { name: "Close customization" }).click();
  }
  console.log(
    "PASS customer product catalog uses the same live product/options data",
  );

  await customer.goto(
    `http://localhost:3000/orders/${encodeURIComponent(orderNumber)}`,
    { waitUntil: "domcontentloaded", timeout: 90000 },
  );
  await customer.getByText("Order received", { exact: true }).first().waitFor();
  await customer.emulateMedia({ reducedMotion: "reduce" });
  const customerSpinner = await customer.evaluate(async () => {
    const shell = document.createElement("span");
    shell.className = "app-loader";
    shell.innerHTML = "<i></i>";
    document.body.append(shell);
    const spinner = shell.firstElementChild;
    await new Promise((resolve) => setTimeout(resolve, 80));
    const animation = spinner.getAnimations()[0];
    const before = Number(animation?.currentTime ?? 0);
    const iterations = getComputedStyle(spinner).animationIterationCount;
    await new Promise((resolve) => setTimeout(resolve, 300));
    const after = Number(animation?.currentTime ?? 0);
    shell.remove();
    return { before, after, iterations };
  });
  assert.ok(customerSpinner.after > customerSpinner.before);
  assert.equal(customerSpinner.iterations, "infinite");
  await customer.emulateMedia({ reducedMotion: "no-preference" });
  const setStatus = async (status) => {
    const response = await ownerContext.request.post(
      `http://localhost:3001/api/orders/${trackingOrderId}/status`,
      { data: { status } },
    );
    const body = await response.json();
    assert.equal(
      response.status(),
      200,
      `${status} failed: ${JSON.stringify(body)}`,
    );
    return body;
  };
  const ringSamplesPromise = customer.evaluate(
    () =>
      new Promise((resolve) => {
        const values = [];
        const deadline = performance.now() + 12000;
        const waitForStatus = setInterval(() => {
          if (document.querySelector(".status-pill")?.textContent?.includes("Confirmed")) {
            clearInterval(waitForStatus);
            const started = performance.now();
            const sampler = setInterval(() => {
              const ring = document.querySelector(".tracking-ring-progress");
              if (ring) values.push(getComputedStyle(ring).strokeDashoffset);
              if (performance.now() - started > 1400) {
                clearInterval(sampler);
                resolve(values);
              }
            }, 35);
          } else if (performance.now() > deadline) {
            clearInterval(waitForStatus);
            resolve(values);
          }
        }, 25);
      }),
  );
  const confirmed = await setStatus("CONFIRMED");
  assert.equal(confirmed.emailStatus, "SKIPPED");
  await customer
    .getByText("Confirmed", { exact: true })
    .first()
    .waitFor({ timeout: 12000 });
  const ringSamples = await ringSamplesPromise;
  assert.ok(
    new Set(ringSamples).size >= 3,
    "status ring should interpolate across multiple visual frames",
  );
  const ringGeometry = await customer.evaluate(() => {
    const shell = document
      .querySelector(".tracking-rider__ring")
      .getBoundingClientRect();
    const progress = document
      .querySelector(".tracking-rider__progress")
      .getBoundingClientRect();
    const rider = document
      .querySelector(".tracking-rider__ring > div svg")
      .getBoundingClientRect();
    const stroke = getComputedStyle(
      document.querySelector(".tracking-ring-progress"),
    ).strokeWidth;
    return {
      shell: {
        x: shell.x,
        y: shell.y,
        width: shell.width,
        height: shell.height,
      },
      progress: {
        x: progress.x,
        y: progress.y,
        width: progress.width,
        height: progress.height,
      },
      rider: {
        x: rider.x,
        y: rider.y,
        width: rider.width,
        height: rider.height,
      },
      stroke,
    };
  });
  assert.ok(ringGeometry.progress.width >= ringGeometry.shell.width - 1);
  assert.ok(
    Math.abs(
      ringGeometry.rider.x +
        ringGeometry.rider.width / 2 -
        (ringGeometry.shell.x + ringGeometry.shell.width / 2),
    ) < 2,
  );
  assert.ok(parseFloat(ringGeometry.stroke) >= 9);
  assert.equal(await customer.locator(".tracking-ring-progress").count(), 1);
  const repeat = await setStatus("CONFIRMED");
  assert.equal(repeat.emailStatus, "SKIPPED");
  const statusLabels = {
    PREPARING: "Preparing",
    READY: "Ready",
    OUT_FOR_DELIVERY: "Out for delivery",
    DELIVERED: "Delivered",
  };
  for (const status of Object.keys(statusLabels)) {
    await setStatus(status);
    await customer
      .getByText(statusLabels[status], { exact: true })
      .first()
      .waitFor({ timeout: 12000 });
  }
  const events = check(
    await db
      .from("order_notifications")
      .select("id,status")
      .eq("order_id", trackingOrderId)
      .eq("event_type", "ORDER_CONFIRMED"),
    "email events",
  );
  assert.equal(events.length, 1);
  assert.equal(events[0].status, "SKIPPED");
  console.log(
    "PASS customer/Admin loaders keep rotating, tracking ring fills smoothly from real status, rider stays centered, and exactly one confirmation email event exists",
  );
  await ownerContext.close();
  await customerContext.close();
} catch (error) {
  failed = true;
  console.error("FAIL operations live verification: " + error.stack);
} finally {
  if (businessId && riderSettingSnapshot)
    await db.from("business_operating_settings").update({ rider_portal_enabled: riderSettingSnapshot.rider_portal_enabled }).eq("business_id", businessId);
  if (invoiceId) {
    await db.from("payment_transactions").delete().eq("invoice_id", invoiceId);
    await db.from("invoice_lines").delete().eq("invoice_id", invoiceId);
    await db.from("invoices").delete().eq("id", invoiceId);
  }
  const orderIds = [trackingOrderId, posOrderId].filter(Boolean);
  if (orderIds.length) {
    await db.from("refunds").delete().in("order_id", orderIds);
    await db.from("payment_transactions").delete().in("order_id", orderIds);
    if (replacementId)
      await db.from("pos_order_replacements").delete().eq("id", replacementId);
    await db.from("orders").delete().in("id", orderIds);
  }
  if (shiftId) await db.from("register_shifts").delete().eq("id", shiftId);
  const qaUserIds = [ownerId, customerId].filter(Boolean);
  if (qaUserIds.length) {
    await db.from("audit_logs").delete().in("actor_id", qaUserIds);
    await db
      .from("customer_restrictions")
      .delete()
      .in("auth_user_id", qaUserIds);
    await db.from("staff_memberships").delete().in("user_id", qaUserIds);
    await db.from("profiles").delete().in("id", qaUserIds);
  }
  if (ownerId) await db.auth.admin.deleteUser(ownerId);
  if (customerId) await db.auth.admin.deleteUser(customerId);
  await browser.close();
}
if (failed) process.exitCode = 1;
