import assert from "node:assert/strict";
import { randomBytes, randomUUID } from "node:crypto";
import { existsSync } from "node:fs";
import { mkdir } from "node:fs/promises";
import { join } from "node:path";
import { createClient } from "@supabase/supabase-js";
import { chromium } from "playwright";

const ref = process.env.STAGING_SUPABASE_PROJECT_REF;
const url = process.env.STAGING_SUPABASE_URL;
const publicKey = process.env.STAGING_SUPABASE_PUBLISHABLE_KEY;
const serviceKey = process.env.STAGING_SUPABASE_SERVICE_ROLE_KEY;
const appUrl = process.env.STAGING_SUPER_ADMIN_URL ?? "http://localhost:3102";
const appHostname = new URL(appUrl).hostname;
const screenshotDir = process.env.STAGING_SCREENSHOT_DIR;
if (process.env.ALLOW_STAGING_ACCEPTANCE !== "1" || process.env.STAGING_ENVIRONMENT !== "staging" ||
  ref !== "jzisqjvroxodvmqxzsob" || new URL(url).hostname !== `${ref}.supabase.co` ||
  (!['localhost', '127.0.0.1'].includes(appHostname) && !/staging/i.test(appHostname)) || !publicKey || !serviceKey) {
  throw new Error("Refusing browser acceptance outside verified local/staging resources.");
}

const service = createClient(url, serviceKey, { auth: { persistSession: false, autoRefreshToken: false } });
const email = `qa-platform-browser-${randomUUID()}@qa.example`;
const password = `${randomBytes(18).toString("base64url")}A1!`;
let userId;
let unauthorizedUserId;
let onboardingPackageId;
let provisionedBusinessId;
let provisionedOwnerEmail;
let browser;
let assertions = 0;
function check(condition, message) { assertions++; assert.ok(condition, message); }
function checked(result, label) { if (result.error) throw new Error(`${label}: ${result.error.message}`); return result.data; }
function sessionCookies(session) {
  const encoded = `base64-${Buffer.from(JSON.stringify(session)).toString("base64url")}`;
  const pieces = encoded.match(/.{1,3000}/g) ?? [];
  return pieces.map((value, index) => ({
    name: pieces.length === 1 ? "qazipro-platform-auth" : `qazipro-platform-auth.${index}`,
    value, url: appUrl, sameSite: "Lax",
  }));
}

try {
  const created = checked(await service.auth.admin.createUser({ email, password, email_confirm: true }), "Create QA identity");
  userId = created.user?.id;
  if (!userId) throw new Error("QA identity missing");
  const role = checked(await service.from("platform_roles").select("id").eq("key", "PLATFORM_OWNER").single(), "Owner role");
  checked(await service.from("platform_staff").insert({ user_id: userId, email, display_name: "QA Browser Owner", status: "ACTIVE" }), "QA staff");
  checked(await service.from("platform_staff_roles").insert({ staff_user_id: userId, role_id: role.id }), "QA role");
  const client = createClient(url, publicKey, { auth: { persistSession: false, autoRefreshToken: false } });
  const signed = checked(await client.auth.signInWithPassword({ email, password }), "QA session");
  if (!signed.session) throw new Error("QA session missing");
  const packageCode = `QA_BROWSER_${Date.now()}`;
  const onboardingPackage = checked(await service.from("service_packages").insert({
    code: packageCode,
    name: "QA Browser Package",
    description: "Temporary package for the public staging onboarding acceptance flow.",
    currency: "PKR",
    base_fee: 10000,
    setup_fee: 5000,
    included_branches: 1,
    billing_frequency: "MONTHLY",
    is_active: true,
  }).select("id").single(), "Create onboarding package fixture");
  onboardingPackageId = onboardingPackage.id;
  checked(await client.from("platform_incidents").select("id,business_id,branch_id,severity,health_state,environment,component,title,status,occurrences,last_seen_at,assigned_staff_user_id,businesses(name)", { count: "exact" }).order("last_seen_at", { ascending: false }).range(0, 49), "Health data");
  checked(await client.from("businesses").select("id,name,slug,branches:branches!branches_business_id_fkey(id,name,code)").order("name").limit(500), "Business options");
  checked(await client.from("branches").select("id,business_id,name,restaurant_name,city,is_active,online_ordering_enabled,temporarily_closed,updated_at,businesses:businesses!branches_business_id_fkey(name)").order("updated_at", { ascending: false }).range(0, 49), "Branch directory data");
  checked(await client.from("platform_staff").select("user_id,display_name,email,status,mfa_required,last_login_at,access_revoked_at,created_at,platform_staff_roles:platform_staff_roles!platform_staff_roles_staff_user_id_fkey(platform_roles(key,name)),platform_staff_permissions:platform_staff_permissions!platform_staff_permissions_staff_user_id_fkey(permission_key,allowed)").limit(10), "Team directory data");
  checked(await client.from("businesses").select("id,slug,name,short_description,phone,email,address,city,currency,timezone,is_active,created_at,business_branding(*),branches:branches!branches_business_id_fkey(*)").eq("id", "a0000000-0000-4000-8000-000000000001").maybeSingle(), "Restaurant 360 identity");
  const businessId = "a0000000-0000-4000-8000-000000000001";
  const workspaceQueries = [
    ["onboarding", client.from("restaurant_onboarding").select("*").eq("business_id", businessId).maybeSingle()],
    ["subscription", client.from("restaurant_subscriptions").select("*,service_packages(name,code)").eq("business_id", businessId).maybeSingle()],
    ["entitlements", client.from("service_entitlements").select("capability_key,enabled,source,effective_from,effective_until,limit_value").eq("business_id", businessId)],
    ["apps", client.from("mobile_app_records").select("*").eq("business_id", businessId)],
    ["domains", client.from("platform_domain_records").select("*").eq("business_id", businessId)],
    ["deployments", client.from("deployment_records").select("*").eq("business_id", businessId)],
    ["incidents", client.from("platform_incidents").select("*").eq("business_id", businessId)],
    ["tickets", client.from("support_tickets").select("*").eq("business_id", businessId)],
    ["devices", client.from("pos_offline_devices").select("id,branch_id,name:device_name,app_version,is_active,last_sync_at,updated_at").eq("business_id", businessId)],
    ["audit", client.from("platform_audit_logs").select("id,actor_user_id,action,target_type,reason,created_at").eq("business_id", businessId)],
  ];
  const workspaceResults = await Promise.all(workspaceQueries.map(([, query]) => query));
  const workspaceErrors = workspaceResults.flatMap((result, index) => result.error ? [`${workspaceQueries[index][0]}: ${result.error.message}`] : []);
  check(workspaceErrors.length === 0, `Restaurant 360 data: ${workspaceErrors.join("; ")}`);

  const chrome = ["C:/Program Files/Google/Chrome/Application/chrome.exe", "C:/Program Files (x86)/Google/Chrome/Application/chrome.exe"].find(existsSync);
  browser = await chromium.launch({ headless: true, ...(chrome ? { executablePath: chrome } : {}) });
  const context = await browser.newContext({ viewport: { width: 1440, height: 900 } });
  await context.addCookies(sessionCookies(signed.session));
  const page = await context.newPage();
  const errors = [];
  page.on("pageerror", error => errors.push(error.message));
  page.on("console", message => { if (message.type() === "error") errors.push(message.text()); });
  const routes = ["/", "/restaurants", "/restaurants/a0000000-0000-4000-8000-000000000001", "/onboarding", "/onboarding/new", "/branches", "/apps", "/domains", "/deployments", "/health", "/support", "/billing", "/packages", "/tasks", "/team", "/integrations", "/audit"];
  for (const route of routes) {
    await page.goto(`${appUrl}${route}`, { waitUntil: "domcontentloaded" });
    try {
      await page.locator(".platform-main h1").waitFor({ timeout: 20000 });
    } catch (error) {
      const title = await page.title();
      const body = (await page.locator("body").innerText().catch(() => "")).replace(/\s+/g, " ").slice(0, 500);
      throw new Error(`Route ${route} did not render the platform shell (url=${page.url()}, title=${title}, body=${body})`, { cause: error });
    }
    check(new URL(page.url()).pathname === route, `${route} redirected unexpectedly`);
    check((await page.locator(".platform-main h1").innerText()).trim().length > 0, `${route} has no heading`);
    check(await page.getByText("Platform data is temporarily unavailable.").count() === 0, `${route} reports unavailable platform data`);
    if (screenshotDir && ["/", "/restaurants", "/health"].includes(route)) {
      await page.waitForLoadState("networkidle");
      await mkdir(screenshotDir, { recursive: true });
      await page.screenshot({ path: join(screenshotDir, `platform-${route === "/" ? "overview" : route.slice(1)}-desktop.png`) });
    }
  }
  const onboardingSuffix = `${Date.now()}-${randomBytes(3).toString("hex")}`;
  provisionedOwnerEmail = `qa-onboarding-${onboardingSuffix}@staging.qazipro.invalid`;
  let provisioningRequests = 0;
  page.on("request", request => {
    if (request.method() === "POST" && new URL(request.url()).pathname === "/onboarding/new") provisioningRequests += 1;
  });
  await page.goto(`${appUrl}/onboarding/new`, { waitUntil: "domcontentloaded" });
  await page.locator('[name="name"]').fill(`QA Browser Restaurant ${onboardingSuffix}`);
  await page.locator('[name="slug"]').fill(`qa-browser-${onboardingSuffix}`);
  await page.locator('[name="ownerName"]').fill("QA Browser Owner");
  await page.locator('[name="ownerEmail"]').fill(provisionedOwnerEmail);
  await page.getByRole("button", { name: "Continue" }).click();
  await page.getByRole("button", { name: "Continue" }).click();
  await page.getByRole("button", { name: "Continue" }).click();
  check(await page.getByText("Select an active service package before continuing.").isVisible(), "Missing package did not show an inline error");
  check(await page.locator('[name="packageId"]').isVisible(), "Missing package advanced away from the commercials step");
  await page.locator('[name="packageId"]').selectOption({ index: 1 });
  await page.getByRole("button", { name: "Continue" }).click();
  await page.getByRole("button", { name: "Continue" }).click();
  await page.locator('[name="branchName"]').fill("QA Main Branch");
  await page.getByRole("button", { name: "Continue" }).click();
  await page.locator("form.wizard").evaluate((form) => {
    const wizard = form;
    wizard.requestSubmit();
    wizard.requestSubmit();
  });
  await page.waitForURL(value => /^\/restaurants\/[0-9a-f-]+$/.test(value.pathname), { timeout: 30000 });
  provisionedBusinessId = new URL(page.url()).pathname.split("/").at(-1);
  check(provisioningRequests === 1, `Provisioning submitted ${provisioningRequests} requests instead of one`);
  check(Boolean(provisionedBusinessId), "Provisioning success did not navigate to the created restaurant");
  await page.waitForLoadState("networkidle");
  await page.keyboard.press("Control+k");
  await page.getByRole("dialog", { name: "Command palette" }).waitFor({ state: "visible", timeout: 10000 });
  check(await page.getByRole("dialog", { name: "Command palette" }).isVisible(), "Command palette did not open");
  await page.keyboard.press("Escape");
  check(await page.getByRole("dialog", { name: "Command palette" }).count() === 0, "Command palette did not close");
  await page.setViewportSize({ width: 390, height: 844 });
  await page.reload({ waitUntil: "domcontentloaded" });
  check(await page.getByRole("button", { name: "Open menu" }).isVisible(), "Mobile navigation unavailable");
  const overflow = await page.evaluate(() => document.documentElement.scrollWidth > window.innerWidth + 1);
  check(!overflow, "Mobile viewport has horizontal page overflow");
  if (screenshotDir) await page.screenshot({ path: join(screenshotDir, "platform-audit-mobile.png") });
  check(errors.length === 0, `Browser runtime errors: ${errors.join("; ")}`);

  const expiredContext = await browser.newContext();
  const expiredSession = { access_token: "expired", refresh_token: "expired", expires_at: 1, token_type: "bearer" };
  await expiredContext.addCookies(sessionCookies(expiredSession));
  const expiredPage = await expiredContext.newPage();
  await expiredPage.goto(`${appUrl}/restaurants`, { waitUntil: "domcontentloaded" });
  await expiredPage.waitForURL(value => value.pathname === "/login", { timeout: 15000 });
  check(new URL(expiredPage.url()).pathname === "/login", "Expired session was not redirected to login");
  await expiredContext.close();

  await page.setViewportSize({ width: 1440, height: 900 });
  await page.goto(`${appUrl}/`, { waitUntil: "domcontentloaded" });
  await page.locator(".account-menu summary").click();
  await page.getByRole("button", { name: "Sign out" }).click();
  await page.waitForURL(value => value.pathname === "/login", { timeout: 15000 });
  check(new URL(page.url()).pathname === "/login", "Sign out did not clear the platform session");

  const unauthorizedEmail = `qa-platform-denied-${randomUUID()}@qa.example`;
  const unauthorized = checked(await service.auth.admin.createUser({ email: unauthorizedEmail, password, email_confirm: true }), "Create unauthorized identity");
  unauthorizedUserId = unauthorized.user?.id;
  const unauthorizedClient = createClient(url, publicKey, { auth: { persistSession: false, autoRefreshToken: false } });
  const unauthorizedSession = checked(await unauthorizedClient.auth.signInWithPassword({ email: unauthorizedEmail, password }), "Unauthorized session").session;
  const deniedContext = await browser.newContext();
  await deniedContext.addCookies(sessionCookies(unauthorizedSession));
  const deniedPage = await deniedContext.newPage();
  await deniedPage.goto(`${appUrl}/restaurants`, { waitUntil: "domcontentloaded" });
  await deniedPage.waitForURL(value => value.pathname === "/login", { timeout: 15000 });
  check(new URL(deniedPage.url()).pathname === "/login" && new URL(deniedPage.url()).searchParams.get("error") === "unauthorized", "Non-staff identity entered platform directory");
  await deniedContext.close();
  await context.close();
  console.log(JSON.stringify({ ok: true, assertions, routes: routes.length, mobile: "PASS", unauthorized: "DENIED" }));
} finally {
  if (browser) await browser.close();
  if (provisionedBusinessId) {
    for (const table of ["platform_tasks","support_tickets","platform_incidents","deployment_records","platform_integration_status","mobile_app_records","platform_domain_records","service_entitlements","restaurant_subscriptions"]) {
      await service.from(table).delete().eq("business_id", provisionedBusinessId);
    }
    const onboarding = await service.from("restaurant_onboarding").select("id").eq("business_id", provisionedBusinessId);
    for (const row of onboarding.data ?? []) await service.from("onboarding_documents").delete().eq("onboarding_id", row.id);
    await service.from("staff_invitations").delete().eq("business_id", provisionedBusinessId);
    await service.from("restaurant_onboarding").delete().eq("business_id", provisionedBusinessId);
    await service.from("platform_audit_logs").delete().eq("business_id", provisionedBusinessId);
    await service.from("businesses").delete().eq("id", provisionedBusinessId);
  }
  if (onboardingPackageId) await service.from("service_packages").delete().eq("id", onboardingPackageId);
  if (provisionedOwnerEmail) {
    const invitedUsers = await service.auth.admin.listUsers({ page: 1, perPage: 1000 });
    const invited = invitedUsers.data?.users.find(candidate => candidate.email?.toLowerCase() === provisionedOwnerEmail.toLowerCase());
    if (invited) await service.auth.admin.deleteUser(invited.id);
  }
  if (userId) {
    await service.from("platform_audit_logs").delete().eq("actor_user_id", userId);
    await service.from("platform_staff").delete().eq("user_id", userId);
    await service.auth.admin.deleteUser(userId);
  }
  if (unauthorizedUserId) await service.auth.admin.deleteUser(unauthorizedUserId);
}
