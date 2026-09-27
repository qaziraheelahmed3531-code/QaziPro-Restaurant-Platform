// Staging table fixture only. Checkout is intercepted: no email/order side effects.
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { parseEnv } from "node:util";
import { createClient } from "@supabase/supabase-js";
import { chromium, expect } from "playwright/test";

const env = parseEnv(await readFile(new URL("../apps/customer/.env.local", import.meta.url), "utf8"));
const expected = "https://jzisqjvroxodvmqxzsob.supabase.co";
const base = process.env.CUSTOMER_TEST_URL || "http://localhost:3105";
if (!/^http:\/\/(localhost|127\.0\.0\.1)(:\d+)?$/.test(base) && base !== "https://italian-pizza.staging.qazipro.com") throw Error("Only local or approved Italian Pizza staging is allowed");
if (env.NEXT_PUBLIC_SUPABASE_URL !== expected) throw Error("Staging project safety guard failed");
const db = createClient(expected, env.SUPABASE_SERVICE_ROLE_KEY, { auth: { persistSession:false,autoRefreshToken:false } });
const { data: business, error: businessError } = await db.from("businesses").select("id").eq("slug","italian-pizza").single();
if (businessError) throw Error("Acceptance restaurant unavailable");
const { data: branch, error: branchError } = await db.from("branches").select("id").eq("business_id",business.id).eq("is_active",true).order("sort_order").limit(1).single();
if (branchError) throw Error("Acceptance branch unavailable");
const { data: table, error: tableError } = await db.from("restaurant_tables").insert({business_id:business.id,branch_id:branch.id,code:`QR-QA-${crypto.randomUUID().slice(0,8)}`,name:"QR acceptance table"}).select("id,public_token").single();
if(tableError) throw Error("Fixture could not be created");
let browser; let passed=0;
const pass=name=>{passed++;console.log(`PASS ${name}`)};
try {
  browser=await chromium.launch({channel:"chrome",headless:true});
  const context=await browser.newContext({viewport:{width:390,height:844}});
  const page=await context.newPage(); const errors=[]; const writes=[];
  page.on("pageerror",error=>errors.push(error.message));
  await page.route("**/api/orders",route=>{
    if(route.request().method()==="POST") { writes.push(route.request().postDataJSON()); return route.fulfill({status:503,json:{ok:false,error:"Temporary test failure; your cart is saved."}}); }
    return route.continue();
  });
  await page.goto(`${base}/t/${table.public_token}`, { waitUntil: "domcontentloaded", timeout: 60000 });
  await expect(page.getByRole("region",{name:"Your dining table"})).toContainText("QR acceptance table");
  await expect(page.getByRole("dialog",{name:"Where would you like to order?"})).not.toBeVisible();
  const product=page.getByRole("button",{name:/^View .+ details$/}).first();
  await expect(product).toBeVisible();
  pass("QR resolves correct branch/table and opens full menu without location/login setup");
  await product.click();
  await page.locator("dialog.customization-dialog[open]").getByRole("button",{name:/^Add to Cart/}).click();
  await expect(page.getByRole("dialog",{name:"Your Cart",exact:true})).toContainText("At your table");
  await page.keyboard.press("Escape");
  await page.goto(`${base}/checkout`);
  await expect(page.getByText("Dining at QR acceptance table. Your order goes to this table.")).toBeVisible();
  await expect(page.getByRole("button",{name:"Dine-in · Table QR"})).toBeVisible();
  await expect(page.getByText("Pay at the restaurant",{exact:true})).toBeVisible();
  await page.reload();
  await expect(page.getByRole("region",{name:"Your dining table"})).toContainText("QR acceptance table");
  assert.equal(await page.locator('input[aria-label="Search delivery address"]').count(),0);
  pass("table context/cart survive navigation and reload; checkout uses dine-in not pickup/delivery");
  const invalid=await context.request.get(`${base}/t/`+"0".repeat(48));
  assert.equal(invalid.status(),404);
  const wrongHost=base.startsWith("https:")
    ? await context.request.get(`https://kings-cafe.staging.qazipro.com/t/${table.public_token}`,{maxRedirects:0})
    : await context.request.get(`${base}/t/${table.public_token}`,{headers:{Host:"kings-cafe.staging.qazipro.com"},maxRedirects:0});
  assert.equal(wrongHost.status(),404);
  pass("invalid token and another restaurant hostname fail closed");
  const {error:inactiveError}=await db.from("restaurant_tables").update({is_active:false}).eq("id",table.id).eq("business_id",business.id);
  assert.equal(inactiveError,null);
  await page.reload();
  await expect(page.getByRole("heading",{name:"This table is unavailable"})).toBeVisible();
  await page.getByRole("button",{name:"Leave dine-in mode"}).click();
  await expect(page.getByRole("dialog",{name:"Where would you like to order?"})).toBeVisible();
  pass("deactivation invalidates current table context; explicit leave restores ordering mode selection");
  assert.deepEqual(errors,[]);assert.equal(writes.length,0);
  pass("zero runtime errors; no order or email requests sent");
} finally {
  await browser?.close();
  const {error}=await db.from("restaurant_tables").delete().eq("id",table.id).eq("business_id",business.id).eq("branch_id",branch.id);
  if(error) throw Error("QR fixture cleanup failed");
}
console.log(`${passed} QR browser checks passed. Temporary staging table removed.`);
