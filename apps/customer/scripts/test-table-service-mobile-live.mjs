// Reversible staging verification for Customer QR -> Waiter mobile service requests.
import assert from "node:assert/strict"
import { randomUUID } from "node:crypto"
import { readFileSync } from "node:fs"
import { chromium } from "playwright"
import { createClient } from "@supabase/supabase-js"

const origin=process.argv[2]??"http://localhost:3000"
assert.equal(new URL(origin).hostname,"localhost","Table-service QA may only target localhost UI.")
const env=Object.fromEntries(readFileSync(new URL("../.env.local",import.meta.url),"utf8").split(/\r?\n/).filter(line=>/^[A-Z_]+=/.test(line)).map(line=>{const i=line.indexOf("=");return[line.slice(0,i),line.slice(i+1).trim().replace(/^[\"']|[\"']$/g,"")] }))
const db=createClient(env.NEXT_PUBLIC_SUPABASE_URL,env.SUPABASE_SERVICE_ROLE_KEY,{auth:{persistSession:false,autoRefreshToken:false}})
const branchId="22222222-2222-4222-8222-222222222222"
let tableId,originalEnabled,browser,requestIds=[]
const check=(result,label)=>{if(result.error)throw new Error(`${label}: ${result.error.code??result.error.status??"provider error"}`);return result.data}

try{
  const branch=check(await db.from("branches").select("business_id,waiter_call_enabled").eq("id",branchId).single(),"Resolve branch")
  originalEnabled=branch.waiter_call_enabled
  check(await db.from("branches").update({waiter_call_enabled:true}).eq("id",branchId),"Enable table service")
  const table=check(await db.from("restaurant_tables").insert({business_id:branch.business_id,branch_id:branchId,code:`QA-${randomUUID().slice(0,8)}`,name:"QA Mobile Service Table",seats:2}).select("id,public_token").single(),"Create table")
  tableId=table.id
  browser=await chromium.launch({headless:true,executablePath:"C:/Program Files/Google/Chrome/Application/chrome.exe"})
  const page=await browser.newPage({viewport:{width:390,height:844},hasTouch:true})
  await page.goto(new URL(`/t/${table.public_token}`,origin).href,{waitUntil:"domcontentloaded",timeout:90000})
  await page.getByRole("region",{name:"Your dining table"}).waitFor({timeout:30000})
  await page.getByRole("button",{name:"Request bill",exact:true}).click()
  await page.getByRole("button",{name:"Bill requested",exact:true}).waitFor({timeout:30000})
  await page.getByRole("button",{name:"Call a waiter",exact:true}).click()
  await page.getByRole("button",{name:"Waiter requested",exact:true}).waitFor({timeout:30000})
  const requests=check(await db.from("restaurant_table_service_requests").select("id,request_type,status").eq("table_id",tableId).order("request_type"),"Verify service requests")
  requestIds=requests.map(row=>row.id)
  assert.deepEqual(requests.map(row=>row.request_type).sort(),["CALL_WAITER","REQUEST_BILL"])
  assert.ok(requests.every(row=>row.status==="PENDING"))
  const notifications=check(await db.from("staff_notification_outbox").select("event_type,dedupe_key").eq("branch_id",branchId).in("dedupe_key",requestIds.map(id=>`table-service:${id}`)),"Verify waiter notification outbox")
  assert.ok(notifications.length>=2,"Each table request must queue waiter notifications")
  console.log("PASS: QR customer created distinct CALL_WAITER and REQUEST_BILL events with waiter push outbox records")
}finally{
  if(browser)await browser.close().catch(()=>{})
  if(requestIds.length)await db.from("staff_notification_outbox").delete().in("dedupe_key",requestIds.map(id=>`table-service:${id}`))
  if(tableId){await db.from("restaurant_table_service_requests").delete().eq("table_id",tableId);await db.from("restaurant_tables").delete().eq("id",tableId)}
  if(originalEnabled!==undefined)await db.from("branches").update({waiter_call_enabled:originalEnabled}).eq("id",branchId)
  console.log("RESTORED: temporary QR table, service requests and notification fixtures removed")
}
