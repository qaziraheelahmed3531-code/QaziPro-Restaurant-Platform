import { createClient } from "@supabase/supabase-js"

const url=process.env.STAGING_SUPABASE_URL?.trim()
const anonKey=process.env.STAGING_SUPABASE_PUBLISHABLE_KEY?.trim()
const password=process.env.STAGING_QA_PASSWORD?.trim()
const baseUrl=(process.env.STAGING_CUSTOMER_URL??"http://127.0.0.1:3100").replace(/\/$/,"")
const adminBaseUrl=(process.env.STAGING_ADMIN_URL??"http://127.0.0.1:3101").replace(/\/$/,"")
if(!url||!anonKey||!password)throw new Error("Staging URL, publishable key and QA password are required.")
if(!/staging/i.test(process.env.STAGING_ENVIRONMENT??""))throw new Error("Refusing to run without STAGING_ENVIRONMENT=staging.")

const ids={
  businessA:"a0000000-0000-4000-8000-000000000001",businessB:"b0000000-0000-4000-8000-000000000001",
  branchA1:"a0000000-0000-4000-8000-000000000101",branchA2:"a0000000-0000-4000-8000-000000000102",branchB1:"b0000000-0000-4000-8000-000000000101",
  areaA1:"a0000000-0000-4000-8000-000000000801",
  productA:"a0000000-0000-4000-8000-000000000301",productB:"b0000000-0000-4000-8000-000000000301",variantA:"a0000000-0000-4000-8000-000000000401",variantB:"b0000000-0000-4000-8000-000000000401",
  groupA:"a0000000-0000-4000-8000-000000000501",optionA:"a0000000-0000-4000-8000-000000000601",
}
const results=[]
const pass=(name,detail="")=>results.push({name,status:"PASS",detail})
const assert=(condition,message)=>{if(!condition)throw new Error(message)}

async function request(path,{host="restaurant-a.staging.qazipro.com",branch,method="GET",body,requestId,ip,token}={}){
  const headers={host,"x-forwarded-host":host,"x-request-id":requestId??`qa-${crypto.randomUUID()}`}
  if(token)headers.authorization=`Bearer ${token}`
  if(ip)headers["x-forwarded-for"]=ip
  if(branch)headers["x-qazipro-branch-id"]=branch
  if(body!==undefined)headers["content-type"]="application/json"
  const response=await fetch(`${baseUrl}${path}`,{method,headers,body:body===undefined?undefined:JSON.stringify(body),redirect:"manual"})
  const json=await response.json().catch(()=>null)
  return {response,json}
}

const health=await request("/api/v1/health",{host:"localhost"})
assert(health.response.status===200&&health.json?.data?.dependencies?.database==="ok","health endpoint failed")
assert(Boolean(health.response.headers.get("x-request-id")),"health request id missing")
pass("Health and request correlation")

const unresolved=await request("/api/v1/storefront/context")
assert(unresolved.response.status===409&&unresolved.json?.error?.code==="BRANCH_REQUIRED","A domain did not require explicit branch")
assert(unresolved.json?.error?.details?.availableBranches?.length===2,"A domain branch list is wrong")
pass("Custom domain resolves Restaurant A and requires branch")

const contextA=await request("/api/v1/storefront/context",{branch:ids.branchA1})
const contextB=await request("/api/v1/storefront/context",{host:"restaurant-b.staging.qazipro.com",branch:ids.branchB1})
assert(contextA.json?.data?.business?.id===ids.businessA&&contextA.json?.data?.branch?.id===ids.branchA1,"A/A1 context mismatch")
assert(contextB.json?.data?.business?.id===ids.businessB&&contextB.json?.data?.branch?.id===ids.branchB1,"B/B1 context mismatch")
pass("Domain → business → branch isolation")

const unknown=await request("/api/v1/storefront/context",{host:"unknown.staging.qazipro.com",branch:ids.branchA1})
assert(unknown.response.status===404&&unknown.json?.error?.code==="TENANT_NOT_FOUND","Unknown domain did not fail closed")
pass("Unknown domain fails closed")

const unverified=await request("/api/v1/storefront/context",{host:"unverified.staging.invalid",branch:ids.branchA1})
assert(unverified.response.status===404&&unverified.json?.error?.code==="TENANT_NOT_FOUND","Unverified custom domain resolved")
pass("Unverified custom domain fails closed")

const catalogA=await request("/api/v1/catalog",{branch:ids.branchA1})
const catalogB=await request("/api/v1/catalog",{host:"restaurant-b.staging.qazipro.com",branch:ids.branchB1})
assert(catalogA.json?.data?.products?.length===1&&catalogA.json.data.products[0].price===1100,"A1 branch override missing")
assert(catalogA.json.data.products[0].variants?.[0]?.priceDelta===200&&catalogA.json.data.products[0].modifierGroups?.[0]?.options?.[0]?.priceDelta===100,"A variant/modifier missing")
assert(catalogB.json?.data?.products?.length===1&&catalogB.json.data.products[0].name.includes("Meal B"),"B catalog leaked or missing")
pass("Branch override, variant and modifier catalog")

const idempotency=`staging-http-${Date.now()}`
const orderPayload={idempotencyKey:idempotency,branchId:ids.branchA1,serviceMode:"PICKUP",paymentMethod:"CASH_ON_DELIVERY",customerName:"STAGING QA Customer",customerPhone:"03000000001",promoCode:"STAGING10",items:[{productId:ids.productA,variantId:ids.variantA,quantity:1,modifiers:[{groupId:ids.groupA,optionId:ids.optionA}]}]}
const created=await request("/api/v1/orders",{branch:ids.branchA1,method:"POST",body:orderPayload})
assert(created.response.status===201&&created.json?.data?.order?.id,"A checkout failed")
const retry=await request("/api/v1/orders",{branch:ids.branchA1,method:"POST",body:orderPayload})
assert(retry.response.status===201&&retry.json?.data?.order?.id===created.json.data.order.id&&retry.json?.data?.order?.idempotent===true,"HTTP idempotency failed")
const orderA=created.json.data.order
assert(orderA.subtotal===1400&&orderA.discount===140&&orderA.tax===126&&orderA.total===1386,`A authoritative totals wrong: ${JSON.stringify(orderA)}`)
pass("HTTP checkout tax, promotion, variant, modifier and idempotency",`order=${orderA.id}`)

const tracked=await request(`/api/orders/${encodeURIComponent(orderA.orderNumber)}`,{token:undefined})
const trackedWithToken=await fetch(`${baseUrl}/api/orders/${encodeURIComponent(orderA.orderNumber)}`,{headers:{"x-order-token":orderA.guestTrackingToken}})
const trackedJson=await trackedWithToken.json()
assert(tracked.response.status===404&&trackedWithToken.status===200&&trackedJson?.order?.id===orderA.id,"Guest tracking token boundary failed")
const invalidTracking=await fetch(`${baseUrl}/api/orders/${encodeURIComponent(orderA.orderNumber)}`,{headers:{"x-order-token":"invalid-staging-token"}})
assert(invalidTracking.status===404,"Invalid guest tracking token was accepted")
pass("Guest tracking and invalid-token rejection")

const conflict=await request("/api/v1/orders",{branch:ids.branchA1,method:"POST",body:{...orderPayload,customerName:"Changed payload"}})
assert(conflict.response.status===400,"Idempotency payload conflict accepted")
pass("Idempotency key conflict rejected")

const deliveryPayload={...orderPayload,idempotencyKey:`staging-delivery-${Date.now()}`,serviceMode:"DELIVERY",promoCode:undefined,deliveryAreaId:ids.areaA1,deliveryAddress:"STAGING QA delivery point, Islamabad",locationSource:"GPS",latitude:33.7100,longitude:73.0550}
const delivery=await request("/api/v1/orders",{branch:ids.branchA1,method:"POST",body:deliveryPayload})
assert(delivery.response.status===201&&delivery.json?.data?.order?.id,`Delivery checkout failed: ${JSON.stringify(delivery.json)}`)
const deliveryOrder=delivery.json.data.order
assert(deliveryOrder.deliveryFee>0&&deliveryOrder.total===deliveryOrder.subtotal-deliveryOrder.discount+deliveryOrder.tax+deliveryOrder.deliveryFee,"Delivery authoritative total is inconsistent")
pass("Real delivery route and authoritative delivery total",`fee=${deliveryOrder.deliveryFee}`)

const orderBPayload={idempotencyKey:`staging-http-b-${Date.now()}`,branchId:ids.branchB1,serviceMode:"PICKUP",paymentMethod:"ONLINE",customerName:"STAGING QA B",customerPhone:"03000000002",items:[{productId:ids.productB,variantId:ids.variantB,quantity:1,modifiers:[]}]}
const createdB=await request("/api/v1/orders",{host:"restaurant-b.staging.qazipro.com",branch:ids.branchB1,method:"POST",body:orderBPayload})
assert(createdB.response.status===201&&createdB.json?.data?.order?.subtotal===550&&createdB.json.data.order.tax===0,"Restaurant B totals/isolation failed")
pass("Restaurant B independent checkout totals")

async function signedIn(email){
  const client=createClient(url,anonKey,{auth:{persistSession:false,autoRefreshToken:false}})
  const result=await client.auth.signInWithPassword({email,password})
  if(result.error)throw new Error(`${email} auth: ${result.error.message}`)
  return client
}

const a1=await signedIn("a1-staff@staging.qazipro.invalid")
const a1Orders=await a1.from("orders").select("id,business_id,branch_id")
assert(!a1Orders.error&&a1Orders.data.length>=1&&a1Orders.data.every(row=>row.business_id===ids.businessA&&row.branch_id===ids.branchA1),"A1 read escaped its branch")
const a1Inventory=await a1.from("ingredients").select("business_id,branch_id")
assert(!a1Inventory.error&&a1Inventory.data.length===1&&a1Inventory.data[0].branch_id===ids.branchA1,"A1 inventory isolation failed")
const crossUpdate=await a1.from("branch_product_overrides").update({price_override:9999}).eq("branch_id",ids.branchA2).select("branch_id")
assert(!crossUpdate.error&&crossUpdate.data.length===0,"A1 updated A2 override")
const crossWrite=await a1.from("branch_product_overrides").insert({business_id:ids.businessB,branch_id:ids.branchB1,product_id:ids.productB,price_override:1})
assert(Boolean(crossWrite.error),"A staff wrote B catalog")
const crossShift=await a1.rpc("open_pos_shift",{p_branch_id:ids.branchA2,p_opening_cash:0})
assert(Boolean(crossShift.error),"A1 staff opened an A2 register shift")
pass("A1 RLS and register RPC isolation")

const owner=await signedIn("a-owner@staging.qazipro.invalid")
const ownerSession=await owner.auth.getSession()
const ownerToken=ownerSession.data.session?.access_token
assert(Boolean(ownerToken),"Owner bearer token missing")
const signedOrder=await request("/api/v1/orders",{branch:ids.branchA1,method:"POST",token:ownerToken,body:{...orderPayload,idempotencyKey:`staging-auth-${Date.now()}`,promoCode:undefined,customerName:"STAGING QA Signed Customer"}})
assert(signedOrder.response.status===201&&signedOrder.json?.data?.order?.id,"Authenticated checkout failed")
const signedHistory=await request("/api/v1/orders",{token:ownerToken})
assert(signedHistory.response.status===200&&signedHistory.json?.data?.orders?.some(row=>row.id===signedOrder.json.data.order.id),"Authenticated order history failed")
pass("Bearer-authenticated checkout and order history")

const desktopOrders=await fetch(`${adminBaseUrl}/api/desktop-pos/orders?branch=${encodeURIComponent(ids.branchA1)}`,{headers:{authorization:`Bearer ${ownerToken}`}})
const desktopJson=await desktopOrders.json()
assert(desktopOrders.status===200&&desktopJson.orders?.some(row=>row.id===orderA.id),"Website order did not reach Desktop POS API")
const desktopCrossTenant=await fetch(`${adminBaseUrl}/api/desktop-pos/orders?branch=${encodeURIComponent(ids.branchB1)}`,{headers:{authorization:`Bearer ${ownerToken}`}})
assert(desktopCrossTenant.status===403,"Desktop POS API crossed tenant boundary")
pass("Website order reaches Desktop POS API with tenant isolation")

const ownerB=await signedIn("b-owner@staging.qazipro.invalid")
const storagePath=`${ids.businessA}/step3-${Date.now()}.png`
const uploaded=await owner.storage.from("business-logos").upload(storagePath,new Uint8Array([137,80,78,71,13,10,26,10]),{contentType:"image/png",upsert:false})
assert(!uploaded.error,"Restaurant A owner could not write its storage prefix")
const crossStorage=await ownerB.storage.from("business-logos").upload(`${ids.businessA}/forged-${Date.now()}.png`,new Uint8Array([137,80,78,71,13,10,26,10]),{contentType:"image/png",upsert:false})
assert(Boolean(crossStorage.error),"Restaurant B wrote into Restaurant A storage prefix")
await owner.storage.from("business-logos").remove([storagePath])
pass("Storage write isolation")

const crossReport=await a1.rpc("restaurant_report",{p_business_id:ids.businessA,p_start:new Date(Date.now()-3600000).toISOString(),p_end:new Date(Date.now()+60000).toISOString(),p_branch_id:ids.branchA2})
assert(Boolean(crossReport.error),"A1 staff loaded A2 report")
const crossPayments=await a1.from("payment_transactions").select("business_id,branch_id")
assert(!crossPayments.error&&crossPayments.data.every(row=>row.business_id===ids.businessA&&row.branch_id===ids.branchA1),"Payment RLS crossed branch or tenant")
pass("Report and payment isolation")

const multi=await signedIn("a-multi@staging.qazipro.invalid")
const multiInventory=await multi.from("ingredients").select("business_id,branch_id")
assert(!multiInventory.error&&new Set(multiInventory.data.map(row=>row.branch_id)).size===2&&multiInventory.data.every(row=>row.business_id===ids.businessA),"Multi-branch assignment failed")
pass("Assigned multi-branch access")

const b1=await signedIn("b1-staff@staging.qazipro.invalid")
const bOrders=await b1.from("orders").select("business_id,branch_id")
assert(!bOrders.error&&bOrders.data.length>=1&&bOrders.data.every(row=>row.business_id===ids.businessB&&row.branch_id===ids.branchB1),"B staff crossed tenant/branch")
pass("Restaurant B RLS isolation")

const {data:storedA,error:storedError}=await a1.from("orders").select("payment_method,payment_status,total").eq("id",orderA.id).single()
assert(!storedError&&storedA.payment_method==="CASH_ON_DELIVERY"&&storedA.payment_status==="UNPAID","COD boundary was not enforced")
pass("COD-only payment boundary")

const concurrentPayload={...orderPayload,idempotencyKey:`staging-concurrent-${Date.now()}`,promoCode:undefined}
const concurrent=await Promise.all(Array.from({length:6},()=>request("/api/v1/orders",{branch:ids.branchA1,method:"POST",body:concurrentPayload,ip:"198.51.100.88"})))
assert(concurrent.every(item=>item.response.status===201),"Concurrent checkout retry returned a non-success response")
const concurrentIds=new Set(concurrent.map(item=>item.json?.data?.order?.id))
assert(concurrentIds.size===1&&!concurrentIds.has(undefined),"Concurrent idempotency created multiple orders")
pass("Concurrent duplicate-checkout protection")

const rateResponses=[]
for(let index=0;index<11;index++)rateResponses.push(await request("/api/v1/orders",{branch:ids.branchA1,method:"POST",body:{idempotencyKey:`rate-test-${index}`,branchId:ids.branchA1,items:[]},ip:"198.51.100.99"}))
assert(rateResponses.slice(0,10).every(item=>item.response.status===400)&&rateResponses[10].response.status===429,"Distributed checkout rate limit boundary failed")
pass("Distributed checkout rate limit (10/minute)")

const started=Date.now()
const loadResponses=await Promise.all(Array.from({length:40},(_,index)=>request("/api/v1/catalog",index%2?{host:"restaurant-b.staging.qazipro.com",branch:ids.branchB1}:{branch:ids.branchA1})))
assert(loadResponses.every(item=>item.response.status===200),"Concurrent catalog load had failures")
assert(loadResponses.every((item,index)=>item.json?.data?.businessId===(index%2?ids.businessB:ids.businessA)),"Concurrent catalog load crossed tenant cache/context")
pass("Concurrent tenant-aware catalog smoke load",`40 requests in ${Date.now()-started}ms`)

console.log(JSON.stringify({ok:true,results},null,2))
