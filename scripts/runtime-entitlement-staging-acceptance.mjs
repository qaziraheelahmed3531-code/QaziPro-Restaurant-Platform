import assert from "node:assert/strict"
import { createClient } from "@supabase/supabase-js"

const url=process.env.STAGING_SUPABASE_URL?.trim()
const publicKey=process.env.STAGING_SUPABASE_PUBLISHABLE_KEY?.trim()
const serviceKey=process.env.STAGING_SUPABASE_SERVICE_ROLE_KEY?.trim()
const password=process.env.STAGING_QA_PASSWORD?.trim()
const customerA=(process.env.STAGING_CUSTOMER_URL??"").replace(/\/$/,"")
const customerB=(process.env.STAGING_CUSTOMER_B_URL??"").replace(/\/$/,"")
if(!url||!publicKey||!serviceKey||!password||!customerA||!customerB||!/staging/i.test(process.env.STAGING_ENVIRONMENT??""))throw new Error("Explicit staging-only entitlement environment is required.")
const ids={businessA:"a0000000-0000-4000-8000-000000000001",businessB:"b0000000-0000-4000-8000-000000000001",branchA:"a0000000-0000-4000-8000-000000000101",branchB:"b0000000-0000-4000-8000-000000000101",productA:"a0000000-0000-4000-8000-000000000301",productB:"b0000000-0000-4000-8000-000000000301"}
const admin=createClient(url,serviceKey,{auth:{persistSession:false,autoRefreshToken:false}})
const clients={}
const orders=[]
const capabilityKeys=["admin.restaurant","pos.web","pos.desktop","inventory","kitchen","waiter","rider","website.ordering","ordering.delivery","ordering.pickup","loyalty","reports.advanced","mobile.android","mobile.ios"]
const check=(result,label)=>{if(result.error)throw new Error(`${label}: ${result.error.message}`);return result.data}
async function login(key,email){const client=createClient(url,publicKey,{auth:{persistSession:false,autoRefreshToken:false}});check(await client.auth.signInWithPassword({email,password}),`Sign in ${key}`);clients[key]=client;return client}
async function set(businessId,capability,enabled){check(await admin.from("service_entitlements").upsert({business_id:businessId,capability_key:capability,enabled,source:"OVERRIDE",notes:"Runtime entitlement staging acceptance"},{onConflict:"business_id,capability_key,source"}),`Set ${capability}`)}
async function request(base,path,{branch,restaurant,platform,token,method="GET",body}={}){const headers={"x-request-id":`ent-${crypto.randomUUID()}`};if(branch)headers["x-qazipro-branch-id"]=branch;if(restaurant)headers["x-qazipro-restaurant"]=restaurant;if(platform)headers["x-qazipro-client-platform"]=platform;if(token)headers.authorization=`Bearer ${token}`;if(body!==undefined)headers["content-type"]="application/json";const response=await fetch(`${base}${path}`,{method,headers,body:body===undefined?undefined:JSON.stringify(body)});return{response,json:await response.json().catch(()=>null)}}

try{
  const ownerA=await login("a","a-owner@staging.qazipro.invalid"),ownerB=await login("b","b-owner@staging.qazipro.invalid")
  check(await admin.from("business_operating_settings").update({rider_portal_enabled:true}).in("business_id",[ids.businessA,ids.businessB]),"Enable disposable rider portals")

  // Required A/B matrix.
  for(const [business,values] of [[ids.businessA,{"website.ordering":true,"pos.web":true,waiter:false,rider:false}],[ids.businessB,{"website.ordering":false,"pos.web":true,waiter:true,rider:true}]])for(const [key,value] of Object.entries(values))await set(business,key,value)
  const aCatalog=await request(customerA,"/api/v1/catalog",{branch:ids.branchA})
  assert.equal(aCatalog.response.status,200,"Restaurant A website must remain enabled")
  const bCatalogDenied=await request(customerB,"/api/v1/catalog",{branch:ids.branchB})
  assert.equal(bCatalogDenied.response.status,403,"Restaurant B website OFF must deny the runtime API")
  assert.equal(check(await ownerA.rpc("has_permission",{target_business:ids.businessA,requested_permission:"pos.use"}),"A POS permission"),true)
  assert.equal(check(await ownerB.rpc("has_permission",{target_business:ids.businessB,requested_permission:"pos.use"}),"B POS permission"),true)
  assert.ok((await ownerA.rpc("create_waiter_pos_order",{p_payload:{branchId:ids.branchA,tableReference:"ENTITLEMENT A",items:[{itemKind:"product",productId:ids.productA,quantity:1,modifiers:[]}]}})).error,"A waiter OFF must deny direct RPC")
  assert.ok((await ownerA.rpc("rider_dashboard",{p_branch_id:ids.branchA})).error,"A rider OFF must deny direct RPC")
  const bWaiter=check(await ownerB.rpc("create_waiter_pos_order",{p_payload:{branchId:ids.branchB,tableReference:"ENTITLEMENT B",notes:"Disposable entitlement QA",items:[{itemKind:"product",productId:ids.productB,quantity:1,modifiers:[]}]}}),"B waiter ON runtime")
  orders.push(bWaiter.id)
  assert.equal(check(await ownerB.rpc("rider_dashboard",{p_branch_id:ids.branchB}),"B rider ON runtime").enabled,true)
  assert.ok((await ownerA.rpc("resolve_runtime_entitlement",{p_business_id:ids.businessB,p_branch_id:ids.branchB,p_capability_key:"website.ordering"})).error,"A staff must not inspect B entitlements")

  // Toggle without code changes and prove the runtimes update immediately.
  await set(ids.businessA,"waiter",true);await set(ids.businessA,"rider",true);await set(ids.businessB,"website.ordering",true)
  const aWaiter=check(await ownerA.rpc("create_waiter_pos_order",{p_payload:{branchId:ids.branchA,tableReference:"ENTITLEMENT A TOGGLED",notes:"Disposable entitlement QA",items:[{itemKind:"product",productId:ids.productA,quantity:1,modifiers:[]}]}}),"A waiter toggle")
  orders.push(aWaiter.id)
  assert.equal(check(await ownerA.rpc("rider_dashboard",{p_branch_id:ids.branchA}),"A rider toggle").enabled,true)
  assert.equal((await request(customerB,"/api/v1/catalog",{branch:ids.branchB})).response.status,200,"B website toggle must apply without deployment")

  // Mobile platform, order-mode, loyalty, kitchen and inventory enforcement.
  await set(ids.businessA,"mobile.android",false)
  assert.equal((await request(customerA,"/api/v1/catalog",{restaurant:"qa-restaurant-a",branch:ids.branchA,platform:"android"})).response.status,403,"Android OFF must deny Android API")
  assert.equal((await request(customerA,"/api/v1/catalog",{restaurant:"qa-restaurant-a",branch:ids.branchA,platform:"ios"})).response.status,200,"Android OFF must not deny iOS")
  await set(ids.businessA,"mobile.android",true);await set(ids.businessA,"mobile.ios",false)
  assert.equal((await request(customerA,"/api/v1/catalog",{restaurant:"qa-restaurant-a",branch:ids.branchA,platform:"ios"})).response.status,403,"iOS OFF must deny iOS API")
  await set(ids.businessA,"mobile.ios",true);await set(ids.businessA,"ordering.delivery",false);await set(ids.businessA,"ordering.pickup",false);await set(ids.businessA,"loyalty",false)
  const bootstrap=await request(customerA,"/api/v1/bootstrap",{restaurant:"qa-restaurant-a",platform:"android"})
  assert.equal(bootstrap.response.status,200);assert.ok(bootstrap.json.data.branches.every(branch=>branch.orderingModes.length===0),"Disabled order modes leaked into bootstrap");assert.equal(bootstrap.json.data.features.loyalty,false)
  const ownerSession=check(await ownerA.auth.getSession(),"A owner session").session
  assert.equal((await request(customerA,"/api/v1/loyalty",{restaurant:"qa-restaurant-a",branch:ids.branchA,platform:"android",token:ownerSession.access_token})).response.status,403,"Loyalty OFF must deny loyalty API")
  await set(ids.businessA,"inventory",false);await set(ids.businessA,"kitchen",false);await set(ids.businessA,"pos.web",false);await set(ids.businessA,"pos.desktop",false)
  for(const [permission,label] of [["inventory.read","inventory"],["kds.use","kitchen"],["pos.use","web POS"],["desktop_pos.use","desktop POS"]])assert.equal(check(await ownerA.rpc("has_permission",{target_business:ids.businessA,requested_permission:permission}),`${label} permission`),false,`${label} OFF must deny server permission`)
  const directInsert=await admin.from("orders").insert({order_number:`ENT-BYPASS-${Date.now()}`,business_id:ids.businessA,branch_id:ids.branchA,channel:"POS",service_mode:"PICKUP",customer_name:"Bypass",customer_phone:"Bypass",subtotal:100,total:100})
  assert.ok(directInsert.error,"Direct database order bypass must be blocked")
  const timings=[]
  for(let index=0;index<8;index++){
    const started=performance.now()
    const resolved=check(await ownerA.rpc("resolve_runtime_entitlements",{p_business_id:ids.businessA,p_branch_id:ids.branchA,p_capability_keys:capabilityKeys}),`Batched resolver ${index+1}`)
    timings.push(performance.now()-started)
    assert.equal(Object.keys(resolved).length,capabilityKeys.length,"Batched resolver omitted a capability")
  }
  const ordered=[...timings].sort((a,b)=>a-b)
  const performanceMs={average:Number((timings.reduce((sum,value)=>sum+value,0)/timings.length).toFixed(1)),p95:Number(ordered[Math.ceil(ordered.length*.95)-1].toFixed(1)),roundTripsPerResolution:1,capabilitiesPerResolution:capabilityKeys.length}
  console.log(JSON.stringify({ok:true,checks:18,matrix:"A website/POS ON waiter/rider OFF; B website OFF POS/waiter/rider ON",togglePropagation:"PASS",crossTenant:"PASS",directBypass:"PASS",performanceMs}))
}finally{
  if(orders.length){await admin.from("audit_logs").delete().eq("entity_type","orders").in("entity_id",orders);await admin.from("orders").delete().in("id",orders)}
  for(const business of [ids.businessA,ids.businessB])for(const capability of capabilityKeys)await set(business,capability,true).catch(()=>{})
}
