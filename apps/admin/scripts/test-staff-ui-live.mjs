// Browser UI verification with a disposable owner. It never submits the invite form or sends email.
import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { readFileSync } from "node:fs";
import { chromium } from "playwright";
import { createClient } from "@supabase/supabase-js";
import { createServerClient } from "@supabase/ssr";

const origin = process.argv[2] ?? "http://localhost:3001";
assert.ok(
  ["localhost", "admin.staging.qazipro.com"].includes(new URL(origin).hostname),
  "Staff UI QA target must be loopback or the canonical Admin staging host",
);
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
const db = createClient(
  env.NEXT_PUBLIC_SUPABASE_URL,
  env.SUPABASE_SERVICE_ROLE_KEY,
  { auth: { persistSession: false, autoRefreshToken: false } },
);
const email = `qa-staff-ui-${randomUUID()}@example.com`;
const password = `Qa!${randomUUID()}`;
let userId;
let browser;
let failed = false;

try {
  const { data: business, error: businessError } = await db
    .from("businesses")
    .select("id")
    .eq("slug", "italian-pizza")
    .single();
  if (businessError) throw businessError;
  const { data: created, error: userError } = await db.auth.admin.createUser({
    email,
    password,
    email_confirm: true,
  });
  if (userError) throw userError;
  userId = created.user.id;
  const { error: membershipError } = await db
    .from("staff_memberships")
    .insert({
      business_id: business.id,
      user_id: userId,
      role: "OWNER",
      is_active: true,
      permissions_customized: true,
    });
  if (membershipError) throw membershipError;
  const jar = new Map();
  const auth = createServerClient(
    env.NEXT_PUBLIC_SUPABASE_URL,
    env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY,
    {
      cookieOptions: {
        name: "italian-pizza-admin-auth",
        path: "/",
        sameSite: "lax",
      },
      cookies: {
        getAll: () => [...jar].map(([name, value]) => ({ name, value })),
        setAll: (values) =>
          values.forEach(({ name, value }) => jar.set(name, value)),
      },
    },
  );
  const { error: signInError } = await auth.auth.signInWithPassword({
    email,
    password,
  });
  if (signInError) throw signInError;
  browser = await chromium.launch({
    headless: true,
    executablePath: "C:/Program Files/Google/Chrome/Application/chrome.exe",
  });
  const context = await browser.newContext();
  await context.addCookies(
    [...jar].map(([name, value]) => ({ name, value, url: origin })),
  );
  const page = await context.newPage();
  const navigation = await page.goto(new URL("/users", origin).href, {
    waitUntil: "domcontentloaded",
    timeout: 20_000,
  });
  if (navigation?.status() !== 200)
    throw new Error(
      `Staff page returned HTTP ${navigation?.status() ?? "unknown"} at ${page.url()}`,
    );
  if (new URL(page.url()).pathname !== "/users")
    throw new Error(`Staff page redirected to ${page.url()}`);
  await page
    .getByRole("columnheader", { name: "Restaurant" })
    .waitFor({ timeout: 20_000 });
  await page.getByRole("button", { name: "Add staff" }).click();
  const restaurant = page.getByLabel("Allowed branches");
  const selectedBranchIds = await restaurant.evaluate((select) =>
    Array.from(select.selectedOptions, (option) => option.value),
  );
  const selectedBranchId = selectedBranchIds[0];
  assert.ok(selectedBranchId, "Add staff must require a restaurant selection");
  assert.ok(
    ((await restaurant.locator("option:checked").textContent()) ?? "").trim(),
    "Invite editor must show the selected restaurant",
  );
  let submitted;
  await page.route("**/api/staff", async (route) => {
    submitted = route.request().postDataJSON();
    await route.fulfill({
      status: 202,
      contentType: "application/json",
      body: JSON.stringify({
        ok: true,
        saved: true,
        pending: true,
        message: "Staff access saved; invitation delivery is pending.",
      }),
    });
  });
  await page
    .getByLabel("Employee email")
    .fill(`qa-browser-payload-${randomUUID()}@example.test`);
  await page.getByRole("button", { name: "Save changes" }).click();
  await page
    .getByText("Staff access saved; invitation delivery is pending.")
    .waitFor({ timeout: 20_000 });
  assert.deepEqual(
    submitted?.branchIds,
    selectedBranchIds,
    "Invite request must retain every selected restaurant",
  );
  assert.equal(
    await page.getByRole("dialog").count(),
    0,
    "A saved invitation must close the editor even when email delivery is pending",
  );
  assert.equal(
    submitted?.sendInvite,
    true,
    "A new staff record must request a secure email link",
  );
  await page.getByRole("button", { name: "Give Desktop POS access" }).click();
  assert.equal(await page.getByLabel("Role preset").inputValue(), "CASHIER");
  for (const label of [
    "QaziPRO POS Desktop",
    "Web POS Counter",
    "View orders",
    "Update order status",
    "Print receipts / tokens",
  ]) {
    const permission = page.getByLabel(label);
    assert.equal(
      await permission.isChecked(),
      true,
      `${label} must be fixed on for Desktop POS`,
    );
    assert.equal(
      await permission.isDisabled(),
      true,
      `${label} must not be removable from Desktop POS`,
    );
  }
  await page
    .getByLabel("Employee email")
    .fill(`qa-desktop-payload-${randomUUID()}@example.test`);
  await page.getByRole("button", { name: "Save changes" }).click();
  assert.equal(submitted?.role, "CASHIER");
  assert.deepEqual(
    [
      "desktop_pos.use",
      "pos.use",
      "orders.read",
      "orders.manage",
      "receipts.print",
    ].every((permission) => submitted?.permissions.includes(permission)),
    true,
  );
  console.log(
    "PASS: Staff UI keeps general invites separate and submits the dedicated Desktop POS profile with every core grant fixed",
  );
} catch (error) {
  failed = true;
  const detail = browser
    ? "Browser did not reach the expected Staff table."
    : "Browser did not start.";
  console.error(`FAIL: ${error instanceof Error ? error.message : detail}`);
} finally {
  if (browser) await browser.close();
  if (userId) {
    await db.from("audit_logs").delete().eq("actor_id", userId);
    await db.from("staff_memberships").delete().eq("user_id", userId);
    await db.auth.admin.deleteUser(userId);
  }
  console.log(
    "Disposable Staff UI account removed; no invitation email was sent.",
  );
}

if (failed) process.exitCode = 1;
