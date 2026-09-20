// Browser-level waiter -> POS queue -> cash ledger verification. All users,
// orders, payments and shifts are disposable and removed in finally.
import assert from "node:assert/strict"
import { randomUUID } from "node:crypto"
import { readFileSync } from "node:fs"
import { chromium } from "playwright"
import { createClient } from "@supabase/supabase-js"
import { createServerClient } from "@supabase/ssr"

const origin=process.argv[2]??"http://localhost:3001",env=Object.fromEntries(readFileSync(new URL("../.env.local",import.meta.url),"utf8").split(/\r?\n/).filter(line=>/^[A-Z_]+=/.test(line)).map(line=>{const i=line.indexOf("=");return[line.slice(0,i),line.slice(i+1).trim().replace(/^["']|["']$/g,"")] }))
const db=createClient(env.NEXT_PUBLIC_SUPABASE_URL,env.SUPABASE_SERVICE_ROLE_KEY,{auth:{persistSession:false,autoRefreshToken:false}})
let waiterId,ownerId,managerId,orderId,shiftId,browser;let failed=false
const checked=(result,label)=>{if(result.error)throw new Error(`${label}: ${result.error.code??result.error.status??"provider error"}`);return result.data}
async function account(role,branch,business){const email=`qa-${role.toLowerCase()}-${randomUUID()}@example.test`,password=`Qa!${randomUUID()}`,id=checked(await db.auth.admin.createUser({email,password,email_confirm:true,user_metadata:{full_name:role==="WAITER"?"QA Tablet Waiter":role==="CASHIER"?"QA POS Cashier":"QA Admin Owner"}}),`Create ${role}`).user.id;checked(await db.from("staff_memberships").insert({business_id:business,branch_id:role==="OWNER"?null:branch,user_id:id,role,is_active:true,permissions_customized:false}),`Create ${role} membership`);const jar=new Map(),client=createServerClient(env.NEXT_PUBLIC_SUPABASE_URL,env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY,{cookieOptions:{name:"italian-pizza-admin-auth",path:"/",sameSite:"lax"},cookies:{getAll:()=>[...jar].map(([name,value])=>({name,value})),setAll:values=>values.forEach(({name,value})=>jar.set(name,value))}});checked(await client.auth.signInWithPassword({email,password}),`Sign in ${role}`);return{id,client,cookies:[...jar].map(([name,value])=>({name,value,url:origin}))}}
try{
  const branch=checked(await db.from("branches").select("id,business_id").eq("id","22222222-2222-4222-8222-222222222222").single(),"Restaurant")
  const waiter=await account("WAITER",branch.id,branch.business_id);waiterId=waiter.id
  const owner=await account("CASHIER",branch.id,branch.business_id);ownerId=owner.id
  const manager=await account("OWNER",branch.id,branch.business_id);managerId=manager.id
  const shift=checked(await owner.client.rpc("open_register_shift",{p_branch_id:branch.id,p_opening_cash:0,p_notes:"QA waiter POS settlement"}),"Open cashier shift");shiftId=shift.id
  browser=await chromium.launch({headless:true,executablePath:"C:/Program Files/Google/Chrome/Application/chrome.exe"})
  const context=await browser.newContext({viewport:{width:1440,height:1000}});await context.addCookies(owner.cookies);const page=await context.newPage();await page.goto(new URL("/pos",origin).href,{waitUntil:"domcontentloaded",timeout:90000})
  const waiterContext=await browser.newContext({viewport:{width:1180,height:820},hasTouch:true});await waiterContext.addCookies(waiter.cookies);const waiterPage=await waiterContext.newPage();await waiterPage.goto(new URL("/waiter",origin).href,{waitUntil:"domcontentloaded",timeout:90000})
  await waiterPage.getByRole("heading",{name:"My recent orders"}).waitFor({timeout:30000});await waiterPage.getByRole("textbox",{name:"Search menu"}).waitFor();assert.ok(await waiterPage.locator(".waiter-identity img").count(),"Restaurant logo must be visible on the waiter tablet");assert.equal(await waiterPage.evaluate(()=>document.documentElement.scrollWidth>window.innerWidth),false,"Tablet page must not overflow horizontally");await waiterPage.locator(".waiter-products > button").first().click();await waiterPage.getByLabel("Table / guest reference *").fill("QA TABLE 19");await waiterPage.getByLabel("Guest name (optional)").fill("QA Guest");await waiterPage.getByLabel("Order notes").fill("AUTOMATED QA — DO NOT PREPARE");await waiterPage.getByRole("button",{name:"Send order"}).click();await waiterPage.getByText(/sent to POS and kitchen/i).waitFor({timeout:30000})
  const tabletOrder=checked(await db.from("orders").select("id,order_number,total").eq("waiter_id",waiterId).eq("table_reference","QA TABLE 19").order("created_at",{ascending:false}).limit(1).single(),"Tablet-created order");orderId=tabletOrder.id;const order={id:tabletOrder.id,orderNumber:tabletOrder.order_number,total:Number(tabletOrder.total)};await waiterContext.close()
  await page.getByRole("heading",{name:"Waiter orders"}).waitFor({timeout:30000})
  const adminContext=await browser.newContext({viewport:{width:1440,height:1000}});await adminContext.addCookies(manager.cookies);const adminPage=await adminContext.newPage()
  await adminPage.goto(new URL("/orders?status=CONFIRMED",origin).href,{waitUntil:"domcontentloaded",timeout:90000})
  const orderSearch=adminPage.getByPlaceholder("Order, token, customer, waiter or table");await orderSearch.waitFor({timeout:30000});await orderSearch.fill(order.orderNumber)
  const adminRow=adminPage.locator("tbody tr").filter({hasText:order.orderNumber}).first();await adminRow.getByText("QA TABLE 19",{exact:false}).waitFor({timeout:30000});await adminRow.getByText("QA Tablet Waiter",{exact:false}).waitFor();await adminRow.getByRole("button",{name:"Open"}).click();const drawer=adminPage.locator(".order-detail");await drawer.getByText("Table QA TABLE 19",{exact:true}).waitFor();await drawer.getByText("QA Tablet Waiter",{exact:false}).waitFor();await adminContext.close()
  const queueOrder=page.getByRole("button").filter({hasText:"QA TABLE 19"}).first();await queueOrder.waitFor();await queueOrder.click()
  const paymentResponse=page.waitForResponse(response=>response.url().includes("/rpc/settle_waiter_pos_order"),{timeout:30000})
  await page.getByRole("button",{name:"Mark paid"}).click();const response=await paymentResponse;assert.equal(response.status(),200)
  await page.getByText(new RegExp(`${order.orderNumber} paid`)).waitFor({timeout:30000})
  const saved=checked(await db.from("orders").select("payment_status,payment_reference,waiter_id,table_reference").eq("id",orderId).single(),"Paid order")
  assert.equal(saved.payment_status,"PAID");assert.equal(saved.payment_reference,"CASH");assert.equal(saved.waiter_id,waiterId)
  const payment=checked(await db.from("payment_transactions").select("amount,status,shift_id").eq("order_id",orderId).single(),"Payment ledger")
  assert.equal(payment.amount,order.total);assert.equal(payment.status,"PAID");assert.equal(payment.shift_id,shiftId)
  console.log(`PASS: waiter order ${order.orderNumber} appeared in POS queue and cashier cash settlement updated the authoritative payment ledger`)
}catch(error){failed=true;console.error(`FAIL: ${error instanceof Error?error.message:"waiter POS browser verification failed"}`)}finally{
  if(browser)await browser.close()
  if(orderId){await db.from("payment_transactions").delete().eq("order_id",orderId);await db.from("audit_logs").delete().eq("entity_id",orderId);await db.from("orders").delete().eq("id",orderId)}
  if(shiftId){await db.from("cash_movements").delete().eq("shift_id",shiftId);await db.from("register_shifts").delete().eq("id",shiftId)}
  for(const id of [waiterId,ownerId,managerId].filter(Boolean)){await db.from("audit_logs").delete().eq("actor_id",id);await db.from("staff_memberships").delete().eq("user_id",id);await db.auth.admin.deleteUser(id)}
  console.log("Disposable waiter/POS cashier/admin owner, order, payment and register shift removed.")
}
if(failed)process.exitCode=1
