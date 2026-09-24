// One disposable online order is followed by its immutable id through the
// public API, Admin, Web POS, Desktop POS API, Kitchen, reports and tracking.
import assert from "node:assert/strict"
import { chromium } from "playwright"
import { createClient } from "@supabase/supabase-js"
import { createServerClient } from "@supabase/ssr"

const url=process.env.STAGING_SUPABASE_URL?.trim()
const publicKey=process.env.STAGING_SUPABASE_PUBLISHABLE_KEY?.trim()
const serviceKey=process.env.STAGING_SUPABASE_SERVICE_ROLE_KEY?.trim()
const password=process.env.STAGING_QA_PASSWORD?.trim()
const customerOrigin=(process.env.STAGING_CUSTOMER_URL??"https://qazipro-restaurant-a-staging.vercel.app").replace(/\/$/,"")
const adminOrigin=(process.env.STAGING_ADMIN_URL??"http://127.0.0.1:3101").replace(/\/$/,"")
if(!url||!publicKey||!serviceKey||!password)throw new Error("Explicit staging credentials are required.")
if(!/staging/i.test(process.env.STAGING_ENVIRONMENT??""))throw new Error("Refusing to run without STAGING_ENVIRONMENT=staging.")
const adminHostname=new URL(adminOrigin).hostname
if(!["localhost","127.0.0.1"].includes(adminHostname)&&!/staging/i.test(adminHostname))throw new Error("The browser gate may only target localhost or an explicitly named staging Admin host.")

const ids={businessA:"a0000000-0000-4000-8000-000000000001",branchA1:"a0000000-0000-4000-8000-000000000101",productA:"a0000000-0000-4000-8000-000000000301",variantA:"a0000000-0000-4000-8000-000000000401",groupA:"a0000000-0000-4000-8000-000000000501",optionA:"a0000000-0000-4000-8000-000000000601"}
const db=createClient(url,serviceKey,{auth:{persistSession:false,autoRefreshToken:false}})
const owner=createClient(url,publicKey,{auth:{persistSession:false,autoRefreshToken:false}})
let browser,order
const checked=(result,label)=>{if(result.error)throw new Error(`${label}: ${result.error.message}`);return result.data}

async function adminCookies(){
  const jar=new Map()
  const client=createServerClient(url,publicKey,{cookieOptions:{name:"italian-pizza-admin-auth",path:"/",sameSite:"lax"},cookies:{getAll:()=>[...jar].map(([name,value])=>({name,value})),setAll:values=>values.forEach(({name,value})=>jar.set(name,value))}})
  checked(await client.auth.signInWithPassword({email:"a-owner@staging.qazipro.invalid",password}),"Admin browser sign-in")
  return [...jar].map(([name,value])=>({name,value,url:adminOrigin}))
}

async function publicRequest(path,options={}){
  const headers={"x-qazipro-branch-id":ids.branchA1,...options.headers}
  if(options.body)headers["content-type"]="application/json"
  const response=await fetch(`${customerOrigin}${path}`,{...options,headers,body:options.body?JSON.stringify(options.body):undefined})
  const json=await response.json().catch(()=>null)
  return{response,json}
}

try{
  const ownerSession=checked(await owner.auth.signInWithPassword({email:"a-owner@staging.qazipro.invalid",password}),"Owner API sign-in").session
  assert.ok(ownerSession?.access_token,"Owner bearer token is missing")
  const payload={idempotencyKey:`full-order-${Date.now()}`,branchId:ids.branchA1,serviceMode:"PICKUP",paymentMethod:"CASH_ON_DELIVERY",customerName:"Full Order QA",customerPhone:"03000000009",customerEmail:"full-order@staging.qazipro.invalid",items:[{productId:ids.productA,variantId:ids.variantA,quantity:1,modifiers:[{groupId:ids.groupA,optionId:ids.optionA}]}]}
  const created=await publicRequest("/api/v1/orders",{method:"POST",body:payload})
  assert.equal(created.response.status,201,`Public checkout failed: ${JSON.stringify(created.json)}`)
  order=created.json?.data?.order
  assert.ok(order?.id&&order?.orderNumber&&order?.guestTrackingToken,"Checkout response omitted order identity or tracking token")
  const persisted=checked(await db.from("orders").select("id,order_number,business_id,branch_id,channel,status,total").eq("id",order.id).single(),"Backend order")
  assert.equal(persisted.id,order.id);assert.equal(persisted.channel,"WEBSITE");assert.equal(persisted.business_id,ids.businessA);assert.equal(persisted.branch_id,ids.branchA1)

  browser=await chromium.launch({headless:true,executablePath:"C:/Program Files/Google/Chrome/Application/chrome.exe"})
  const context=await browser.newContext({viewport:{width:1440,height:1000}})
  await context.addCookies(await adminCookies())
  await context.addCookies([{name:"ip-admin-branch",value:ids.branchA1,url:adminOrigin}])

  const adminPage=await context.newPage()
  await adminPage.goto(`${adminOrigin}/orders?order=${encodeURIComponent(order.id)}`,{waitUntil:"domcontentloaded",timeout:90000})
  const detail=adminPage.locator(".order-detail").getByText(order.orderNumber,{exact:false})
  try{await detail.waitFor({timeout:30000})}catch(error){
    const body=(await adminPage.locator("body").innerText()).replace(/\s+/g," ").slice(0,1200)
    throw new Error(`Admin exact-order drawer missing at ${adminPage.url()}: ${body}; ${error instanceof Error?error.message:"timeout"}`)
  }

  const posPage=await context.newPage()
  await posPage.goto(`${adminOrigin}/pos`,{waitUntil:"domcontentloaded",timeout:90000})
  const liveCard=posPage.locator(`[data-pos-order-id="${order.id}"]`)
  await liveCard.waitFor({timeout:30000});await liveCard.getByText("Online",{exact:true}).waitFor();await liveCard.getByRole("link",{name:"Open order"}).waitFor()

  const desktop=await fetch(`${adminOrigin}/api/desktop-pos/orders?branch=${ids.branchA1}`,{headers:{authorization:`Bearer ${ownerSession.access_token}`}})
  const desktopJson=await desktop.json()
  assert.equal(desktop.status,200,`Desktop order fetch failed: ${JSON.stringify(desktopJson)}`)
  assert.ok(desktopJson.orders.some(candidate=>candidate.id===order.id),"Exact online order is absent from Desktop POS API")

  checked(await owner.from("orders").update({status:"CONFIRMED"}).eq("id",order.id).eq("status",persisted.status).select("id").single(),"Admin confirms order")
  const kitchenPage=await context.newPage()
  await kitchenPage.goto(`${adminOrigin}/kitchen`,{waitUntil:"domcontentloaded",timeout:90000})
  let ticket=kitchenPage.locator(".kds-ticket").filter({hasText:order.orderNumber})
  await ticket.waitFor({timeout:30000});await ticket.getByRole("button",{name:"Start preparing"}).click()
  ticket=kitchenPage.locator(".kds-ticket").filter({hasText:order.orderNumber})
  await ticket.getByRole("button",{name:"Mark ready"}).waitFor({timeout:30000});await ticket.getByRole("button",{name:"Mark ready"}).click();await ticket.waitFor({state:"detached",timeout:30000})
  assert.equal(checked(await db.from("orders").select("status").eq("id",order.id).single(),"KDS order").status,"READY")

  const report=checked(await owner.rpc("restaurant_report",{p_business_id:ids.businessA,p_start:new Date(Date.now()-3600000).toISOString(),p_end:new Date(Date.now()+3600000).toISOString(),p_branch_id:ids.branchA1}),"Restaurant report")
  const websiteChannel=(report.channels??[]).find(channel=>channel.label==="WEBSITE_PICKUP")
  assert.ok(websiteChannel&&Number(websiteChannel.orders)>=1,"The exact order window is absent from the branch report")

  const delivered=await fetch(`${adminOrigin}/api/desktop-pos/orders`,{method:"POST",headers:{authorization:`Bearer ${ownerSession.access_token}`,"content-type":"application/json"},body:JSON.stringify({branchId:ids.branchA1,orderId:order.id,status:"DELIVERED"})})
  const deliveredJson=await delivered.json()
  assert.equal(delivered.status,200,`Desktop lifecycle update failed: ${JSON.stringify(deliveredJson)}`)
  const tracked=await publicRequest(`/api/v1/orders/${encodeURIComponent(order.orderNumber)}/tracking`,{headers:{"x-order-token":order.guestTrackingToken}})
  assert.equal(tracked.response.status,200,`Customer tracking failed: ${JSON.stringify(tracked.json)}`)
  assert.equal(tracked.json?.data?.orderNumber,order.orderNumber);assert.equal(tracked.json?.data?.status,"DELIVERED")

  console.log(JSON.stringify({ok:true,orderId:order.id,orderNumber:order.orderNumber,path:["Customer Website","Backend","Restaurant Admin","Web POS","Desktop POS API","Kitchen/KDS","Reports","Customer Tracking"],finalStatus:"DELIVERED"}))
  await context.close()
}finally{
  if(browser)await browser.close()
  if(order?.id){
    await db.from("audit_logs").delete().eq("entity_id",order.id)
    await db.from("orders").delete().eq("id",order.id)
    console.log("Disposable full-order fixture removed.")
  }
}
