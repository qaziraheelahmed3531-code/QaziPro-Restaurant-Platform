import assert from "node:assert/strict";
import { randomBytes, randomUUID } from "node:crypto";
import { existsSync } from "node:fs";
import { createClient } from "@supabase/supabase-js";
import { chromium } from "playwright";

const expectedRef = process.env.STAGING_SUPABASE_PROJECT_REF;
const url = process.env.STAGING_SUPABASE_URL;
const publicKey = process.env.STAGING_SUPABASE_PUBLISHABLE_KEY;
const serviceKey = process.env.STAGING_SUPABASE_SERVICE_ROLE_KEY;
const adminUrl = process.env.STAGING_ADMIN_URL ?? "http://localhost:3101";
const adminHostname = new URL(adminUrl).hostname;
if (process.env.ALLOW_STAGING_ACCEPTANCE !== "1" || process.env.STAGING_ENVIRONMENT !== "staging" ||
  !expectedRef || expectedRef !== "jzisqjvroxodvmqxzsob" || !url || new URL(url).hostname !== `${expectedRef}.supabase.co` ||
  !publicKey || !serviceKey || (!['localhost','127.0.0.1'].includes(adminHostname) && !/staging/i.test(adminHostname))) {
  throw new Error("Refusing Admin acceptance without verified staging-only configuration.");
}

const A = "a0000000-0000-4000-8000-000000000001";
const B = "b0000000-0000-4000-8000-000000000001";
const A1 = "a0000000-0000-4000-8000-000000000101";
const A2 = "a0000000-0000-4000-8000-000000000102";
const B1 = "b0000000-0000-4000-8000-000000000101";
const service = createClient(url, serviceKey, { auth: { persistSession: false, autoRefreshToken: false } });
const created = [];
const leads = [];
const marker = `qa-portal-${randomUUID()}`;
const password = `${randomBytes(18).toString("base64url")}A1!`;
let assertions = 0;
let browser;
function check(condition, message) { assertions += 1; assert.ok(condition, message); }
function checked(result, label) { if (result.error) throw new Error(`${label}: ${result.error.message}`); return result.data; }

async function createStaff(kind, role, branches = []) {
  const email = `${marker}-${kind}@qa.example`;
  const user = checked(await service.auth.admin.createUser({ email, password, email_confirm: true }), `Create ${kind}`)?.user;
  if (!user) throw new Error(`Create ${kind}: no user`);
  created.push({ userId: user.id, membershipId: null });
  const membership = checked(await service.from("staff_memberships").insert({
    business_id: A, user_id: user.id, role, branch_id: branches[0] ?? null,
    is_active: true, permissions_customized: role !== "OWNER",
  }).select("id").single(), `Membership ${kind}`);
  created.at(-1).membershipId = membership.id;
  if (branches.length) checked(await service.from("staff_membership_branches").insert(
    branches.map(branchId => ({ membership_id: membership.id, business_id: A, branch_id: branchId })),
  ), `Branches ${kind}`);
  if (role !== "OWNER") checked(await service.from("staff_membership_permissions").insert({
    membership_id: membership.id, permission_code: "orders.read",
  }), `Permissions ${kind}`);
  return email;
}

async function login(page, email) {
  await page.goto(`${adminUrl}/login`, { waitUntil: "networkidle" });
  await page.getByLabel("Work email").fill(email);
  await page.getByLabel("Password", { exact: true }).fill(password);
  await page.getByRole("button", { name: "Sign in", exact: true }).click();
  try {
    await page.waitForURL(value => !value.pathname.startsWith("/login") && !value.pathname.startsWith("/auth/"), { timeout: 30000 });
  } catch {
    const alert = await page.getByRole("alert").allTextContents();
    throw new Error(`Admin sign-in did not complete: ${new URL(page.url()).pathname}; ${alert.join("; ")}`);
  }
  check(!page.url().includes("error=unauthorized"), `${email} was not authorized`);
}

async function limitedRls(email) {
  const client = createClient(url, publicKey, { auth: { persistSession: false, autoRefreshToken: false } });
  checked(await client.auth.signInWithPassword({ email, password }), "Limited staff sign-in");
  for (const [business, branch, expected] of [[A, A1, true], [A, A2, false], [B, B1, false]]) {
    const access = checked(await client.rpc("staff_can_access_branch", { target_business: business, target_branch: branch }), "Branch authorization");
    check(access === expected, `Wrong branch access for ${branch}`);
  }
  const otherOrders = checked(await client.from("orders").select("id").eq("business_id", B).limit(1), "Other restaurant orders");
  check(otherOrders.length === 0, "Limited staff could read Restaurant B orders");
}

async function cleanup() {
  const matchingLeads = await service.from("platform_demo_requests").select("id").eq("email", `${marker}-lead@qa.example`);
  if (!matchingLeads.error) for (const row of matchingLeads.data ?? []) leads.push(row.id);
  for (const id of new Set(leads)) await service.from("platform_demo_requests").delete().eq("id", id);
  for (const { userId, membershipId } of created.reverse()) {
    if (membershipId) {
      await service.from("staff_membership_permissions").delete().eq("membership_id", membershipId);
      await service.from("staff_membership_branches").delete().eq("membership_id", membershipId);
      await service.from("staff_memberships").delete().eq("id", membershipId);
    }
    await service.auth.admin.deleteUser(userId);
  }
}

try {
  const qaBranches = checked(await service.from("branches").select("id,business_id,is_active").in("id", [A1, A2, B1]), "QA branches");
  check(qaBranches.length === 3 && qaBranches.every(row => row.is_active), "QA branch fixtures unavailable");
  const owner = await createStaff("owner", "OWNER");
  const limited = await createStaff("limited", "STAFF", [A1]);
  await limitedRls(limited);

  const installedChrome = ["C:/Program Files/Google/Chrome/Application/chrome.exe", "C:/Program Files (x86)/Google/Chrome/Application/chrome.exe"].find(existsSync);
  browser = await chromium.launch({ headless: true, ...(installedChrome ? { executablePath: installedChrome } : {}) });
  const ownerContext = await browser.newContext({ viewport: { width: 1440, height: 900 } });
  const ownerPage = await ownerContext.newPage();
  const ownerErrors = [];
  ownerPage.on("pageerror", error => ownerErrors.push(error.message));
  await login(ownerPage, owner);
  await ownerPage.locator(".admin-content").waitFor();
  check(await ownerPage.locator('.admin-nav a[href="/menu"]').count() > 0, "Owner menu link absent");
  check(await ownerPage.locator('.admin-nav a[href="/branches"]').count() > 0, "Owner branch link absent");
  await ownerPage.getByLabel("Active branch").locator(`option[value="${A2}"]`).waitFor({ state: "attached" });
  const branchValues = await ownerPage.getByLabel("Active branch").locator("option").evaluateAll(options => options.map(option => option.value));
  check(branchValues.includes(A1) && branchValues.includes(A2), "Owner cannot see both QA branches");
  await ownerPage.keyboard.press("Control+k");
  await ownerPage.getByLabel("Search permitted pages").fill("Add menu item");
  check(await ownerPage.getByRole("option", { name: /Add menu item/ }).count() === 1, "Owner quick action absent");
  await ownerPage.keyboard.press("Escape");
  check(!(await ownerPage.locator(".admin-command-dialog").evaluate(node => node.open)), "Command palette did not close");
  check(ownerErrors.length === 0, `Owner browser runtime errors: ${ownerErrors.join("; ")}`);
  await ownerContext.close();

  const limitedContext = await browser.newContext({ viewport: { width: 390, height: 844 } });
  const limitedPage = await limitedContext.newPage();
  const limitedErrors = [];
  limitedPage.on("pageerror", error => limitedErrors.push(error.message));
  await login(limitedPage, limited);
  await limitedPage.locator(".admin-content").waitFor();
  check(new URL(limitedPage.url()).pathname === "/orders", "Limited staff did not land on Orders");
  check(await limitedPage.locator('.admin-nav a[href="/menu"]').count() === 0, "Limited staff sees Menu");
  check(await limitedPage.locator('.admin-nav a[href="/branches"]').count() === 0, "Limited staff sees Branches");
  await limitedPage.getByLabel("Active branch").locator(`option[value="${A1}"]`).waitFor({ state: "attached" });
  const limitedValues = await limitedPage.getByLabel("Active branch").locator("option").evaluateAll(options => options.map(option => option.value));
  check(limitedValues.includes(A1) && !limitedValues.includes(A2) && !limitedValues.includes(B1), "Limited staff sees an unassigned branch");
  await limitedPage.goto(`${adminUrl}/settings`, { waitUntil: "domcontentloaded" });
  await limitedPage.waitForURL(url => url.pathname === "/orders", { timeout: 15000 });
  check(new URL(limitedPage.url()).pathname === "/orders", "Limited staff entered Settings");
  check(limitedErrors.length === 0, `Limited browser runtime errors: ${limitedErrors.join("; ")}`);
  await limitedContext.close();

  const demoContext = await browser.newContext();
  const demoPage = await demoContext.newPage();
  await demoPage.goto(`${adminUrl}/demo`, { waitUntil: "domcontentloaded" });
  const leadEmail = `${marker}-lead@qa.example`;
  const response = await demoPage.evaluate(async email => {
    const result = await fetch("/api/demo-request", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ fullName: "QA Portal", businessName: "QA Restaurant", email, phone: "+923000000000", branchBand: "ONE" }) });
    return { status: result.status, body: await result.json() };
  }, leadEmail);
  check(
    response.status === 201 && response.body.code === "REQUEST_RECEIVED",
    `Demo request did not save (status ${response.status}, code ${response.body?.code ?? "UNKNOWN"})`,
  );
  const lead = checked(await service.from("platform_demo_requests").select("id").eq("email", leadEmail).single(), "Demo request lookup");
  leads.push(lead.id);
  await demoContext.close();

  console.log(JSON.stringify({ ok: true, assertions, areas: ["owner login", "owner navigation", "command palette", "limited staff", "branch RLS", "tenant isolation", "demo lead"] }));
} finally {
  if (browser) await browser.close();
  await cleanup();
}
