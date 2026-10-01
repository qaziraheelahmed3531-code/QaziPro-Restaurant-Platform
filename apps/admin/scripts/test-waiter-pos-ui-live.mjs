// Browser-level waiter table -> KDS -> POS -> cash ledger verification.
// All users, tables, orders, payments and shifts are disposable and removed.
import assert from "node:assert/strict"
import { randomUUID } from "node:crypto"
import { readFileSync } from "node:fs"
import { chromium } from "playwright"
import { createClient } from "@supabase/supabase-js"
import { createServerClient } from "@supabase/ssr"

const origin=process.argv[2]??"http://localhost:3001"
assert.equal(new URL(origin).hostname,"localhost","The destructive browser fixture may only target localhost.")
const env=Object.fromEntries(readFileSync(new URL("../.env.local",import.meta.url),"utf8").split(/\r?\n/).filter(line=>/^[A-Z_]+=/.test(line)).map(line=>{const i=line.indexOf("=");return[line.slice(0,i),line.slice(i+1).trim().replace(/^["']|["']$/g,"")] }))
const db=createClient(env.NEXT_PUBLIC_SUPABASE_URL,env.SUPABASE_SERVICE_ROLE_KEY,{auth:{persistSession:false,autoRefreshToken:false}})
let waiterId,cashierId,ownerId,orderId,concurrentOrderId,shiftId,tableId,concurrentTableId,browser,hoursSnapshot
let failed=false
const checked=(result,label)=>{if(result.error)throw new Error(`${label}: ${result.error.code??result.error.status??"provider error"} ${String(result.error.message??"").slice(0,180)}`);return result.data}
async function account(role,branch,business){
  const email=`qa-${role.toLowerCase()}-${randomUUID()}@example.test`,password=`Qa!${randomUUID()}`
  const id=checked(await db.auth.admin.createUser({email,password,email_confirm:true,user_metadata:{full_name:role==="WAITER"?"QA Tablet Waiter":role==="CASHIER"?"QA POS Cashier":"QA Admin Owner"}}),`Create ${role}`).user.id
  const membership=checked(await db.from("staff_memberships").insert({business_id:business,branch_id:role==="OWNER"?null:branch,user_id:id,role,is_active:true,permissions_customized:false}).select("id").single(),`Create ${role} membership`)
  if(role!=="OWNER")checked(await db.from("staff_membership_branches").insert({membership_id:membership.id,business_id:business,branch_id:branch}),`Assign ${role} branch`)
  const jar=new Map(),client=createServerClient(env.NEXT_PUBLIC_SUPABASE_URL,env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY,{cookieOptions:{name:"italian-pizza-admin-auth",path:"/",sameSite:"lax"},cookies:{getAll:()=>[...jar].map(([name,value])=>({name,value})),setAll:values=>values.forEach(({name,value})=>jar.set(name,value))}})
  checked(await client.auth.signInWithPassword({email,password}),`Sign in ${role}`)
  return{id,client,cookies:[...jar].map(([name,value])=>({name,value,url:origin}))}
}
const firstProductPayload=async businessId=>{
  const product=checked(await db.from("products").select("id").eq("business_id",businessId).eq("is_active",true).eq("is_available",true).order("sort_order").limit(1).single(),"Resolve product")
  const assignments=checked(await db.from("product_modifier_groups").select("modifier_groups(id,min_selections,modifier_options(id,is_active,is_default,sort_order))").eq("product_id",product.id).order("sort_order"),"Resolve required options")
  const modifiers=assignments.flatMap(assignment=>{const group=Array.isArray(assignment.modifier_groups)?assignment.modifier_groups[0]:assignment.modifier_groups;if(!group)return[];return(group.modifier_options??[]).filter(option=>option.is_active).sort((a,b)=>Number(b.is_default)-Number(a.is_default)||a.sort_order-b.sort_order).slice(0,group.min_selections).map(option=>({groupId:group.id,optionId:option.id}))})
  return{itemKind:"product",productId:product.id,quantity:1,modifiers}
}
try{
  const branch=checked(await db.from("branches").select("id,business_id").eq("id","22222222-2222-4222-8222-222222222222").single(),"Restaurant A")
  const otherBranch=checked(await db.from("branches").select("id").neq("business_id",branch.business_id).eq("is_active",true).limit(1).maybeSingle(),"Restaurant B branch")
  const timezone=checked(await db.from("businesses").select("timezone").eq("id",branch.business_id).single(),"Resolve timezone").timezone
  const weekday=["Sun","Mon","Tue","Wed","Thu","Fri","Sat"].indexOf(new Intl.DateTimeFormat("en-US",{timeZone:timezone,weekday:"short"}).format(new Date()))
  hoursSnapshot=checked(await db.from("business_hours").select("branch_id,day_of_week,opens_at,closes_at,is_closed").eq("branch_id",branch.id).eq("day_of_week",weekday).single(),"Snapshot hours")
  checked(await db.from("business_hours").update({opens_at:"00:00:00",closes_at:"23:59:59",is_closed:false}).eq("branch_id",branch.id).eq("day_of_week",weekday),"Open restaurant for QA")
  tableId=checked(await db.from("restaurant_tables").insert({business_id:branch.business_id,branch_id:branch.id,code:`QA-${randomUUID().slice(0,8)}`,name:"QA Table 19",seats:4}).select("id").single(),"Create UI table").id
  concurrentTableId=checked(await db.from("restaurant_tables").insert({business_id:branch.business_id,branch_id:branch.id,code:`QA-${randomUUID().slice(0,8)}`,name:"QA Concurrency Table",seats:2}).select("id").single(),"Create concurrency table").id
  const waiter=await account("WAITER",branch.id,branch.business_id);waiterId=waiter.id
  const cashier=await account("CASHIER",branch.id,branch.business_id);cashierId=cashier.id
  const owner=await account("OWNER",branch.id,branch.business_id);ownerId=owner.id
  const shift=checked(await cashier.client.rpc("open_register_shift",{p_branch_id:branch.id,p_opening_cash:0,p_notes:"QA waiter POS settlement"}),"Open cashier shift");shiftId=shift.id

  if(otherBranch){const crossTenant=await waiter.client.rpc("waiter_table_dashboard",{p_branch_id:otherBranch.id});assert.ok(crossTenant.error,"Waiter must not read another restaurant's tables")}
  const item=await firstProductPayload(branch.business_id)
  const concurrentPayload={tableId:concurrentTableId,guestName:"Concurrency QA",notes:"Automated concurrency check",items:[item]}
  const mobileOperationId=randomUUID()
  const concurrent=await Promise.all([waiter.client.rpc("mobile_waiter_order",{p_operation_id:mobileOperationId,p_payload:concurrentPayload}),waiter.client.rpc("mobile_waiter_order",{p_operation_id:mobileOperationId,p_payload:concurrentPayload})])
  concurrent.forEach((result,index)=>checked(result,`Concurrent table request ${index+1}`))
  assert.equal(concurrent[0].data.id,concurrent[1].data.id,"Concurrent requests must converge on one bill")
  assert.equal(concurrent.filter(result=>result.data.idempotent===false).length,1,"Exactly one mobile waiter mutation must execute")
  assert.equal(concurrent.filter(result=>result.data.idempotent===true).length,1,"The retry must replay the saved result")
  concurrentOrderId=concurrent[0].data.id
  assert.equal(checked(await db.from("restaurant_table_sessions").select("id").eq("table_id",concurrentTableId).eq("status","OPEN"),"Concurrent sessions").length,1)

  browser=await chromium.launch({headless:true,executablePath:"C:/Program Files/Google/Chrome/Application/chrome.exe"})
  const cashierContext=await browser.newContext({viewport:{width:1440,height:1000}});await cashierContext.addCookies(cashier.cookies);const posPage=await cashierContext.newPage();await posPage.goto(new URL("/pos",origin).href,{waitUntil:"domcontentloaded",timeout:90000})
  const waiterContext=await browser.newContext({viewport:{width:1180,height:820},hasTouch:true});await waiterContext.addCookies(waiter.cookies);const waiterPage=await waiterContext.newPage();await waiterPage.goto(new URL("/waiter",origin).href,{waitUntil:"domcontentloaded",timeout:90000})
  await waiterPage.getByRole("heading",{name:"My recent orders"}).waitFor({timeout:30000});await waiterPage.getByRole("textbox",{name:"Search menu"}).waitFor()
  assert.ok(await waiterPage.locator(".waiter-identity").count(),"Restaurant identity must be visible on the waiter tablet")
  assert.equal(await waiterPage.evaluate(()=>document.documentElement.scrollWidth>window.innerWidth),false,"Tablet page must not overflow horizontally")
  await waiterPage.locator(".waiter-products > button").first().click()
  const optionDialog=waiterPage.getByRole("dialog");if(await optionDialog.count())await optionDialog.getByRole("button",{name:"Add to current order"}).click()
  await waiterPage.getByLabel("Restaurant table *").selectOption(tableId)
  await waiterPage.getByLabel("Guest name (optional)").fill("QA Guest")
  await waiterPage.getByLabel("Order notes").fill("AUTOMATED QA - DO NOT PREPARE")
  await waiterPage.getByRole("button",{name:"Send order"}).click();await waiterPage.getByText(/sent to POS and kitchen/i).waitFor({timeout:30000})
  const tabletOrder=checked(await db.from("orders").select("id,order_number,total,status,order_items(id)").eq("waiter_id",waiterId).eq("table_reference","QA Table 19").order("created_at",{ascending:false}).limit(1).single(),"Tablet-created order")
  orderId=tabletOrder.id
  const initialItemCount=tabletOrder.order_items.length
  const openSession=checked(await db.from("restaurant_table_sessions").select("id,status,order_id").eq("table_id",tableId).eq("status","OPEN").single(),"Open table session")
  assert.equal(openSession.order_id,orderId)
  const deactivate=await db.from("restaurant_tables").update({is_active:false}).eq("id",tableId)
  assert.ok(deactivate.error,"An occupied table must not be deactivated")

  await waiterPage.reload({waitUntil:"domcontentloaded",timeout:90000})
  await waiterPage.locator(".waiter-products > button").first().click();if(await waiterPage.getByRole("dialog").count())await waiterPage.getByRole("dialog").getByRole("button",{name:"Add to current order"}).click()
  await waiterPage.getByLabel("Restaurant table *").selectOption(tableId)
  await waiterPage.getByLabel("Order notes").fill("Second round")
  await waiterPage.getByRole("button",{name:"Add to open bill"}).click();await waiterPage.getByText(new RegExp(`Items added to ${tabletOrder.order_number}`)).waitFor({timeout:30000})
  const merged=checked(await db.from("orders").select("id,total,order_items(id)").eq("id",orderId).single(),"Merged open bill")
  assert.ok(merged.order_items.length>initialItemCount,"Second round must append items to the same bill")
  assert.equal(checked(await db.from("restaurant_table_sessions").select("id").eq("table_id",tableId).eq("status","OPEN"),"Unique open table session").length,1)

  const ownerContext=await browser.newContext({viewport:{width:1440,height:1000}});await ownerContext.addCookies(owner.cookies);const adminPage=await ownerContext.newPage()
  await adminPage.goto(new URL("/orders?status=CONFIRMED",origin).href,{waitUntil:"domcontentloaded",timeout:90000})
  const orderSearch=adminPage.getByPlaceholder("Order, token, customer, waiter or table");await orderSearch.waitFor({timeout:30000});await orderSearch.fill(tabletOrder.order_number)
  const adminRow=adminPage.locator("tbody tr").filter({hasText:tabletOrder.order_number}).first();await adminRow.getByText("QA Table 19",{exact:false}).waitFor({timeout:30000});await adminRow.getByText("QA Tablet Waiter",{exact:false}).waitFor();await adminRow.getByRole("button",{name:"Open"}).click()
  const drawer=adminPage.locator(".order-detail");await drawer.getByText("Table QA Table 19",{exact:true}).waitFor();await drawer.getByText("QA Tablet Waiter",{exact:false}).waitFor()

  const kitchenPage=await ownerContext.newPage();await kitchenPage.goto(new URL("/kitchen",origin).href,{waitUntil:"domcontentloaded",timeout:90000})
  let ticket=kitchenPage.locator(".kds-ticket").filter({hasText:tabletOrder.order_number});await ticket.waitFor({timeout:30000});await ticket.getByRole("button",{name:"Start preparing"}).click()
  ticket=kitchenPage.locator(".kds-ticket").filter({hasText:tabletOrder.order_number});await ticket.getByRole("button",{name:"Mark ready"}).waitFor({timeout:30000});await ticket.getByRole("button",{name:"Mark ready"}).click()
  await ticket.waitFor({state:"detached",timeout:30000})
  assert.equal(checked(await db.from("orders").select("status").eq("id",orderId).single(),"KDS-ready order").status,"READY")
  await waiterPage.getByText(tabletOrder.order_number).first().waitFor({timeout:30000})

  // Bring the cashier surface back to the foreground, matching the real
  // handoff from kitchen/waiter activity to payment. Background Chromium
  // pages throttle recovery timers by design.
  await posPage.bringToFront()
  const tableQueue=posPage.locator("details.waiter-pos-queue")
  if(!await tableQueue.evaluate(element=>element.hasAttribute("open")))await tableQueue.locator("summary").click()
  const queueOrder=posPage.getByRole("button").filter({hasText:"QA Table 19"}).first()
  try{await queueOrder.waitFor({timeout:30000})}catch(error){
    const visible=await cashier.client.from("orders").select("id,business_id,branch_id,table_reference,service_mode,payment_status,status,order_items(id,product_name,quantity,line_total,order_item_modifiers(group_name,option_name))").eq("business_id",branch.business_id).eq("branch_id",branch.id).eq("service_mode","DINE_IN").eq("payment_status","UNPAID").neq("status","CANCELLED").eq("id",orderId).maybeSingle()
    const queueText=await posPage.locator(".waiter-pos-queue").innerText().catch(()=>"queue not rendered")
    throw new Error(`POS table queue did not refresh. Cashier query: ${visible.error?.message??JSON.stringify(visible.data)}. UI: ${queueText.slice(0,240)}. ${error instanceof Error?error.message:"timeout"}`)
  }
  await queueOrder.click()
  const finalTotal=Number(merged.total)
  const waiterPaymentCard=queueOrder.locator("xpath=ancestor::article")
  await waiterPaymentCard.getByLabel("Cash received").fill(String(finalTotal))
  const paymentResponse=posPage.waitForResponse(response=>response.url().includes("/rpc/settle_waiter_pos_order"),{timeout:30000})
  await waiterPaymentCard.getByRole("button",{name:"Mark paid"}).click();const response=await paymentResponse;assert.equal(response.status(),200)
  checked(await owner.client.rpc("set_pos_order_stage",{p_order_id:orderId,p_status:"DELIVERED"}),"Close delivered dine-in order")
  const saved=checked(await db.from("orders").select("status,payment_status,payment_reference,waiter_id,table_reference").eq("id",orderId).single(),"Closed order")
  assert.equal(saved.status,"DELIVERED");assert.equal(saved.payment_status,"PAID");assert.equal(saved.payment_reference,"CASH");assert.equal(saved.waiter_id,waiterId)
  const payment=checked(await db.from("payment_transactions").select("amount,status,shift_id").eq("order_id",orderId).single(),"Payment ledger")
  assert.equal(payment.amount,finalTotal);assert.equal(payment.status,"PAID");assert.equal(payment.shift_id,shiftId)
  const released=checked(await db.from("restaurant_table_sessions").select("status,closed_at").eq("order_id",orderId).single(),"Released table")
  assert.equal(released.status,"SETTLED");assert.ok(released.closed_at)
  console.log(`PASS: ${tabletOrder.order_number} covered table selection, appended round, KDS lifecycle, POS cash ledger, bill close and table release; concurrency and tenant boundaries held`)
  await ownerContext.close();await waiterContext.close();await cashierContext.close()
}catch(error){failed=true;console.error(`FAIL: ${error instanceof Error?error.message:"waiter POS browser verification failed"}`)}finally{
  if(browser)await browser.close()
  if(hoursSnapshot)await db.from("business_hours").update({opens_at:hoursSnapshot.opens_at,closes_at:hoursSnapshot.closes_at,is_closed:hoursSnapshot.is_closed}).eq("branch_id",hoursSnapshot.branch_id).eq("day_of_week",hoursSnapshot.day_of_week)
  for(const id of [orderId,concurrentOrderId].filter(Boolean)){await db.from("payment_transactions").delete().eq("order_id",id);await db.from("audit_logs").delete().eq("entity_id",id);await db.from("orders").delete().eq("id",id)}
  for(const id of [tableId,concurrentTableId].filter(Boolean))await db.from("restaurant_tables").delete().eq("id",id)
  if(shiftId){await db.from("cash_movements").delete().eq("shift_id",shiftId);await db.from("register_shifts").delete().eq("id",shiftId)}
  for(const id of [waiterId,cashierId,ownerId].filter(Boolean)){await db.from("audit_logs").delete().eq("actor_id",id);await db.from("staff_memberships").delete().eq("user_id",id);await db.auth.admin.deleteUser(id)}
  console.log("Disposable waiter/KDS/POS users, tables, orders, payment and register shift removed.")
}
if(failed)process.exitCode=1
