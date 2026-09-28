// Real HTTPS staging: temporary table/request only. No auth credentials, OTP,
// inbox access, orders, email or notification provider calls.
import assert from "node:assert/strict"
import { readFile, mkdir } from "node:fs/promises"
import { parseEnv } from "node:util"
import { execFileSync } from "node:child_process"
import { fileURLToPath } from "node:url"
import { createClient } from "@supabase/supabase-js"
import { chromium, expect } from "playwright/test"

const approvedDb="https://jzisqjvroxodvmqxzsob.supabase.co"
const origin="https://italian-pizza.staging.qazipro.com"
const env=parseEnv(await readFile(new URL("../apps/customer/.env.local",import.meta.url),"utf8"))
if(env.NEXT_PUBLIC_SUPABASE_URL!==approvedDb)throw Error("Approved staging database guard failed")
const db=createClient(approvedDb,env.SUPABASE_SERVICE_ROLE_KEY,{auth:{persistSession:false,autoRefreshToken:false},global:{fetch:(input,init)=>fetch(input,{...init,signal:AbortSignal.timeout(20_000)})}})
function checked(result,label){if(result.error)throw Error(label+" failed");return result.data}
const business=checked(await db.from("businesses").select("id").eq("slug","italian-pizza").single(),"Staging tenant lookup")
const branch=checked(await db.from("branches").select("id,waiter_call_enabled").eq("business_id",business.id).eq("is_active",true).order("sort_order").limit(1).single(),"Staging branch lookup")
let table,browser,context,page,flagChanged=false,passed=0
const pass=name=>{passed++;console.log("PASS "+name)}
try {
  table=checked(await db.from("restaurant_tables").insert({business_id:business.id,branch_id:branch.id,code:"CALL-QA-"+crypto.randomUUID().slice(0,8),name:"Waiter acceptance table"}).select("id,public_token").single(),"Temporary table creation")
  if(!branch.waiter_call_enabled){checked(await db.from("branches").update({waiter_call_enabled:true}).eq("id",branch.id).eq("business_id",business.id),"Enable fixture calls");flagChanged=true}
  browser=await chromium.launch({channel:"chrome",headless:true})
  context=await browser.newContext({viewport:{width:390,height:844}})
  await context.tracing.start({screenshots:true,snapshots:true})
  page=await context.newPage();const errors=[]
  page.on("pageerror",error=>errors.push(error.message))
  await page.goto(origin+"/t/"+table.public_token,{waitUntil:"domcontentloaded",timeout:60_000})
  await expect(page.getByRole("region",{name:"Your dining table"})).toContainText("Waiter acceptance table")
  await expect(page.getByRole("button",{name:/^View .+ details$/}).first()).toBeVisible()
  await expect(page.getByRole("dialog",{name:"Where would you like to order?"})).not.toBeVisible()
  pass("real QR establishes Italian Pizza branch/table and opens full menu without login/setup")
  await expect(page.getByRole("button",{name:"Call a waiter"})).toBeEnabled()
  await page.getByRole("button",{name:"Call a waiter"}).click()
  await expect(page.getByRole("button",{name:"Request sent"})).toBeDisabled({timeout:30_000})
  await expect(page.getByRole("region",{name:"Your dining table"}).getByRole("status")).toContainText("waiter portal")
  const rows=checked(await db.from("restaurant_table_service_requests").select("id,business_id,branch_id,status").eq("table_id",table.id),"Scoped queue lookup")
  assert.equal(rows.length,1);assert.equal(rows[0].business_id,business.id);assert.equal(rows[0].branch_id,branch.id);assert.equal(rows[0].status,"PENDING")
  pass("public customer call creates exactly one real pending request in the correct tenant/branch")
  const duplicate=await page.evaluate(async()=>{const response=await fetch("/api/table-call-waiter",{method:"POST"});return {status:response.status,data:await response.json()}})
  assert.equal(duplicate.status,200);assert.equal(duplicate.data.alreadyOpen,true)
  assert.equal(checked(await db.from("restaurant_table_service_requests").select("id").eq("table_id",table.id),"Deduplicated queue lookup").length,1)
  pass("repeat HTTP call reuses the existing request instead of alerting twice")
  const roleOutput=execFileSync("powershell.exe",["-NoProfile","-Command","npx --offline supabase db query --linked --project-ref jzisqjvroxodvmqxzsob --file supabase/tests/waiter_portal_rls_rollback.sql --output json"],{cwd:new URL("../",import.meta.url),encoding:"utf8",stdio:["ignore","pipe","pipe"],timeout:45_000})
  assert.ok(roleOutput.includes('"rows": []'))
  pass("real database waiter RLS: authorized read/acknowledge/complete; unauthorized read/action denied; rollback")
  assert.equal((await context.request.post(origin+"/api/table-call-waiter",{headers:{Origin:"https://kings-cafe.staging.qazipro.com"}})).status(),403)
  const crossTenant=await context.request.get("https://kings-cafe.staging.qazipro.com/t/"+table.public_token,{maxRedirects:0})
  assert.equal(crossTenant.status(),404)
  pass("cross-origin calls and cross-restaurant QR token resolution are denied")
  checked(await db.from("branches").update({waiter_call_enabled:false}).eq("id",branch.id).eq("business_id",business.id),"Disable fixture calls");flagChanged=true
  await page.reload({waitUntil:"domcontentloaded"})
  await expect(page.getByRole("region",{name:"Your dining table"})).toBeVisible()
  await expect(page.getByRole("button",{name:/Call a waiter|Request sent/})).toHaveCount(0)
  assert.equal(await page.evaluate(async()=> (await fetch("/api/table-call-waiter",{method:"POST"})).status),404)
  pass("turning calls off removes the control and server-side submission is denied")
  for(const width of [360,390,430,768,1440]){
    await page.setViewportSize({width,height:900})
    assert.equal(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth+1),true)
  }
  assert.deepEqual(errors,[])
  pass("real mobile/tablet/desktop QR page has no horizontal overflow or runtime exceptions")
  await context.tracing.stop()
} catch(error) {
  const artifacts=fileURLToPath(new URL("../test-results/table-waiter-staging/",import.meta.url))
  await mkdir(artifacts,{recursive:true})
  await page?.screenshot({path:artifacts+"failure.png",fullPage:true}).catch(()=>{})
  await context?.tracing.stop({path:artifacts+"trace.zip"}).catch(()=>{})
  throw error
} finally {
  await browser?.close()
  // Restore the exact original setting; remove only our immutable table ID.
  if(flagChanged)checked(await db.from("branches").update({waiter_call_enabled:branch.waiter_call_enabled}).eq("id",branch.id).eq("business_id",business.id),"Restore original call setting")
  if(table)checked(await db.from("restaurant_tables").delete().eq("id",table.id).eq("business_id",business.id).eq("branch_id",branch.id),"Temporary table/request cleanup")
}
console.log(`${passed} public staging waiter checks passed. Original flag restored; temporary table/call removed.`)
