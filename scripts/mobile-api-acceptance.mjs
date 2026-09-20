import { createClient } from "@supabase/supabase-js"

const apiBase=(process.env.MOBILE_API_BASE_URL??"http://127.0.0.1:3000").replace(/\/$/,"")
const supabaseUrl=process.env.STAGING_SUPABASE_URL?.trim()
const anonKey=process.env.STAGING_SUPABASE_PUBLISHABLE_KEY?.trim()
const serviceKey=process.env.STAGING_SUPABASE_SERVICE_ROLE_KEY?.trim()
const password=process.env.STAGING_QA_PASSWORD?.trim()
if(!supabaseUrl||!anonKey||!serviceKey||!password)throw new Error("Staging Supabase credentials and QA password are required.")
if(!/staging/i.test(process.env.STAGING_ENVIRONMENT??""))throw new Error("Refusing to run without STAGING_ENVIRONMENT=staging.")

const ids={
  businessA:"a0000000-0000-4000-8000-000000000001",businessB:"b0000000-0000-4000-8000-000000000001",
  branchA1:"a0000000-0000-4000-8000-000000000101",branchA2:"a0000000-0000-4000-8000-000000000102",branchB1:"b0000000-0000-4000-8000-000000000101",branchB2:"b0000000-0000-4000-8000-000000000102",
  areaA1:"a0000000-0000-4000-8000-000000000801",productA:"a0000000-0000-4000-8000-000000000301",productB:"b0000000-0000-4000-8000-000000000301",variantA:"a0000000-0000-4000-8000-000000000401",groupA:"a0000000-0000-4000-8000-000000000501",optionA:"a0000000-0000-4000-8000-000000000601",
}
const qaAdmin=createClient(supabaseUrl,serviceKey,{auth:{persistSession:false,autoRefreshToken:false}})
const results=[]
const pass=(name,detail="")=>results.push({status:"PASS",name,detail})
const assert=(value,message)=>{if(!value)throw new Error(message)}

async function token(email){
  const client=createClient(supabaseUrl,anonKey,{auth:{persistSession:false,autoRefreshToken:false}})
  const {data,error}=await client.auth.signInWithPassword({email,password})
  if(error||!data.session)throw new Error(`${email}: ${error?.message??"no session"}`)
  return {value:data.session.access_token,userId:data.user.id}
}

async function request(path,{restaurant="qa-restaurant-a",branch,token:accessToken,guestToken,method="GET",body,query}={}){
  const url=new URL(`${apiBase}/api/v1${path}`)
  for(const [key,value] of Object.entries(query??{}))if(value!==undefined)url.searchParams.set(key,String(value))
  const headers={"x-request-id":`mobile-qa-${crypto.randomUUID()}`,"x-qazipro-restaurant":restaurant}
  if(branch)headers["x-qazipro-branch-id"]=branch
  if(accessToken)headers.authorization=`Bearer ${accessToken}`
  if(guestToken)headers["x-order-token"]=guestToken
  if(body!==undefined)headers["content-type"]="application/json"
  const response=await fetch(url,{method,headers,body:body===undefined?undefined:JSON.stringify(body)})
  const json=await response.json().catch(()=>null)
  assert(response.headers.get("x-request-id")||path==="/openapi","response correlation ID missing")
  return {response,json}
}

const ownerA=await token("a-owner@staging.qazipro.invalid")
const ownerB=await token("b-owner@staging.qazipro.invalid")

const openapi=await request("/openapi")
assert(openapi.response.status===200&&openapi.json?.openapi==="3.1.0"&&openapi.json?.paths?.["/devices"],"OpenAPI document is incomplete")
pass("OpenAPI machine contract")

const bootstrapA=await request("/bootstrap")
const bootstrapB=await request("/bootstrap",{restaurant:"qa-restaurant-b"})
assert(bootstrapA.response.status===200&&bootstrapA.json?.data?.restaurantKey==="qa-restaurant-a"&&bootstrapA.json.data.branches.length===2,"Restaurant A bootstrap failed")
assert(bootstrapB.response.status===200&&bootstrapB.json?.data?.restaurantKey==="qa-restaurant-b"&&bootstrapB.json.data.branches.length===2,"Restaurant B bootstrap failed")
assert(!JSON.stringify(bootstrapA.json).match(/service.role|supabase_service|businessId/i),"Bootstrap leaked internal configuration")
const unknown=await request("/bootstrap",{restaurant:"does-not-exist"})
assert(unknown.response.status===404,"Unknown restaurant did not fail closed")
const rawTenant=await request("/bootstrap",{query:{business_id:ids.businessA}})
assert(rawTenant.response.status===400&&rawTenant.json?.error?.code==="INTERNAL_TENANT_ID_FORBIDDEN","Raw business id was accepted")
pass("Public slug bootstrap and fail-closed tenant resolution")

const branches=await request("/branches")
const selectedBranch=await request(`/branches/${ids.branchA2}`)
const payments=await request("/payments")
const deepLinks=await request("/auth/deep-links")
assert(branches.json?.data?.branches?.length===2&&selectedBranch.json?.data?.branch?.id===ids.branchA2,"Branch selection contract failed")
assert(payments.json?.data?.methods?.length===1&&payments.json.data.methods[0].id==="CASH_ON_DELIVERY"&&payments.json.data.onlineGateway===null,"Payment capability leaked or changed")
assert(deepLinks.response.status===200&&deepLinks.json?.data?.callbacks?.web&&deepLinks.json?.data?.routes?.order,"Deep-link contract failed")
pass("Branch selection, COD-only payments and deep-link contract")

const forgedBranch=await request("/catalog",{branch:ids.branchB1})
assert(forgedBranch.response.status===404&&forgedBranch.json?.error?.code==="BRANCH_NOT_FOUND","Cross-restaurant branch was accepted")
const catalog=await request("/catalog",{branch:ids.branchA1})
assert(catalog.response.status===200&&catalog.json?.data?.products?.[0]?.variants?.length&&catalog.json.data.products[0].modifierGroups?.length,"Branch catalog contract failed")
pass("Branch isolation, variants and modifiers")

const invalidBearer=await request("/profile",{token:"expired.or.invalid.token"})
assert(invalidBearer.response.status===401&&invalidBearer.json?.error?.code==="INVALID_ACCESS_TOKEN","Invalid/expired bearer was accepted")
const profileA=await request("/profile",{token:ownerA.value})
assert(profileA.response.status===200&&profileA.json?.data?.email==="a-owner@staging.qazipro.invalid","Profile bearer context failed")
const profileB=await request("/profile",{restaurant:"qa-restaurant-b",token:ownerB.value})
assert(profileB.response.status===200&&profileB.json?.data?.email==="b-owner@staging.qazipro.invalid","Profile B isolation failed")
pass("Bearer authentication and profile isolation")

let addressId
try {
  const created=await request("/addresses",{branch:ids.branchA1,token:ownerA.value,method:"POST",body:{label:"other",deliveryAreaId:ids.areaA1,addressLine1:"STAGING mobile contract QA",addressLine2:"",landmark:"QA only",instructions:"delete after test",locationSource:"GPS",latitude:33.7077,longitude:73.0498}})
  assert(created.response.status===201&&created.json?.data?.address?.id,`Address create failed: ${JSON.stringify(created.json)}`)
  addressId=created.json.data.address.id
  const crossDelete=await request(`/addresses/${addressId}`,{restaurant:"qa-restaurant-b",token:ownerB.value,method:"DELETE"})
  assert(crossDelete.response.status===404,"Another tenant/customer deleted address")
  const madeDefault=await request(`/addresses/${addressId}/default`,{token:ownerA.value,method:"POST"})
  assert(madeDefault.response.status===200,"Default address failed")
  const list=await request("/addresses",{token:ownerA.value,query:{limit:1}})
  assert(list.response.status===200&&list.json?.data?.addresses?.some(item=>item.id===addressId),"Address list/pagination failed")
  const updated=await request(`/addresses/${addressId}`,{branch:ids.branchA1,token:ownerA.value,method:"PATCH",body:{instructions:"updated QA"}})
  assert(updated.response.status===200&&updated.json?.data?.address?.instructions==="updated QA","Address update failed")
  pass("Address CRUD/default/location and owner isolation")
} finally {
  if(addressId)await request(`/addresses/${addressId}`,{token:ownerA.value,method:"DELETE"})
}

const promoA=await request("/promotions/validate",{branch:ids.branchA1,method:"POST",body:{code:"STAGING10",subtotal:1400}})
const promoB=await request("/promotions/validate",{restaurant:"qa-restaurant-b",branch:ids.branchB1,method:"POST",body:{code:"STAGING10",subtotal:1400}})
assert(promoA.json?.data?.valid===true&&promoA.json.data.authoritativeAtCheckout===true&&promoB.json?.data?.valid===false,"Promotion tenant isolation failed")
pass("Promotion isolation and authoritative-checkout marker")

try {
  const add=await request("/favourites",{token:ownerA.value,method:"POST",body:{productId:ids.productA}})
  assert(add.response.status===201,"Favourite add failed")
  const own=await request("/favourites",{token:ownerA.value,query:{limit:1}})
  const otherRestaurant=await request("/favourites",{restaurant:"qa-restaurant-b",token:ownerA.value})
  assert(own.json?.data?.favourites?.some(item=>item.product_id===ids.productA)&&!otherRestaurant.json?.data?.favourites?.some(item=>item.product_id===ids.productA),"Favourite tenant isolation failed")
  const loyalty=await request("/loyalty",{token:ownerA.value})
  assert(loyalty.response.status===200&&loyalty.json?.data?.wallet&&Array.isArray(loyalty.json.data.wallet.transactions),"Loyalty wallet contract failed")
  pass("Favourites isolation and real loyalty contract")
} finally {await request("/favourites",{token:ownerA.value,method:"DELETE",query:{productId:ids.productA}})}

const deviceId=`mobile-qa-${crypto.randomUUID()}`,pushToken=`qa-provider-token-${crypto.randomUUID()}-long`
try {
  const registered=await request("/devices",{token:ownerA.value,method:"POST",body:{deviceId,platform:"android",pushToken,appVersion:"0.0.0-qa",locale:"en-PK"}})
  assert(registered.response.status===200&&registered.json?.data?.device?.device_id===deviceId,"Device registration failed")
  const own=await request("/devices",{token:ownerA.value}),other=await request("/devices",{restaurant:"qa-restaurant-b",token:ownerA.value})
  assert(own.json?.data?.devices?.some(item=>item.device_id===deviceId)&&!other.json?.data?.devices?.some(item=>item.device_id===deviceId),"Device tenant isolation failed")
  pass("Multi-device push token tenant/user scope")
} finally {await request("/devices",{token:ownerA.value,method:"DELETE",query:{deviceId}})}

const idempotency=`mobile-contract-${crypto.randomUUID()}`
const payload={idempotencyKey:idempotency,branchId:ids.branchA1,serviceMode:"PICKUP",paymentMethod:"CASH_ON_DELIVERY",customerName:"STAGING Mobile QA",customerPhone:"03000000009",promoCode:"STAGING10",items:[{productId:ids.productA,variantId:ids.variantA,quantity:1,modifiers:[{groupId:ids.groupA,optionId:ids.optionA}]}]}
const created=await request("/orders",{branch:ids.branchA1,token:ownerA.value,method:"POST",body:payload})
const retried=await request("/orders",{branch:ids.branchA1,token:ownerA.value,method:"POST",body:payload})
assert(created.response.status===201&&retried.json?.data?.order?.id===created.json?.data?.order?.id&&retried.json.data.order.idempotent===true,"Mobile checkout idempotency failed")
assert(created.json.data.order.subtotal===1400&&created.json.data.order.discount===140&&created.json.data.order.tax===126&&created.json.data.order.total===1386,"Authoritative variant/modifier/coupon/tax total failed")
const orderNumber=created.json.data.order.orderNumber
const detail=await request(`/orders/${orderNumber}`,{token:ownerA.value}),crossOrder=await request(`/orders/${orderNumber}`,{restaurant:"qa-restaurant-b",token:ownerB.value})
assert(detail.response.status===200&&detail.json?.data?.reorder?.items?.length===1&&crossOrder.response.status===404,"Order detail/reorder isolation failed")
const history=await request("/orders",{token:ownerA.value,query:{limit:1}})
assert(history.response.status===200&&history.json?.data?.orders?.length===1&&Object.hasOwn(history.json.meta,"nextCursor"),"Order pagination failed")
pass("Authoritative checkout, reorder, pagination and idempotency")

const guestPayload={...payload,idempotencyKey:`guest-${crypto.randomUUID()}`,promoCode:undefined,customerName:"STAGING Guest QA"}
const guest=await request("/orders",{branch:ids.branchA1,method:"POST",body:guestPayload})
const guestOrder=guest.json?.data?.order
assert(guest.response.status===201&&guestOrder?.guestTrackingToken,"Guest checkout failed")
const deniedGuest=await request(`/orders/${guestOrder.orderNumber}/tracking`,{guestToken:"wrong-token-which-is-long-enough"})
const tracked=await request(`/orders/${guestOrder.orderNumber}/tracking`,{guestToken:guestOrder.guestTrackingToken})
assert(deniedGuest.response.status===404&&tracked.response.status===200,"Guest tracking security failed")
const cancelled=await request(`/orders/${guestOrder.orderNumber}/cancel`,{guestToken:guestOrder.guestTrackingToken,method:"POST"})
assert(cancelled.response.status===200,"Guest legal cancellation failed")
pass("Guest tracking token and legal cancellation")

const badValidation=await request("/devices",{token:ownerA.value,method:"POST",body:{deviceId:"x",platform:"windows",pushToken:"x"}})
assert(badValidation.response.status===422&&badValidation.json?.error?.code==="VALIDATION_FAILED","Runtime validation contract failed")
const serialized=JSON.stringify(results)
assert(!serialized.includes(serviceKey)&&!serialized.includes(anonKey),"Secret leaked into result")
pass("Validation envelopes and no secret leakage")

const orderId=created.json.data.order.id
await qaAdmin.from("orders").update({status:"CONFIRMED"}).eq("id",orderId)
const {data:outbox,error:outboxError}=await qaAdmin.from("customer_notification_outbox").select("id,status,event_type").eq("order_id",orderId).eq("event_type","ORDER_STATUS_CHANGED")
assert(!outboxError&&outbox?.length,"Order status did not enqueue notification outbox")
pass("Order-status notification outbox")

const logoutSession=await token("a1-staff@staging.qazipro.invalid")
const validSession=await request("/auth/session",{token:logoutSession.value})
const loggedOut=await request("/auth/logout",{token:logoutSession.value,method:"POST"})
const revokedSession=await request("/auth/session",{token:logoutSession.value})
assert(validSession.response.status===200&&loggedOut.response.status===200&&revokedSession.response.status===401,"Session/logout revocation contract failed")
pass("Session validation and global logout revocation")

console.log(JSON.stringify({ok:true,passes:results.length,results},null,2))
