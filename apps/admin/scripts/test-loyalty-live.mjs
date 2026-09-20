// Live, reversible Loyalty & Wallet acceptance test. No real email is sent.
import assert from "node:assert/strict"
import { randomUUID } from "node:crypto"
import { readFileSync } from "node:fs"
import { pathToFileURL } from "node:url"
import { createClient } from "@supabase/supabase-js"
import { createServerClient } from "@supabase/ssr"

const adminOrigin=process.argv[2]??"http://localhost:3001"
const customerOrigin=process.argv[3]??"http://localhost:3000"
const playwrightPath=process.argv[4]
for(const origin of [adminOrigin,customerOrigin])assert.equal(new URL(origin).hostname,"localhost","QA only runs against localhost")
const env=Object.fromEntries(readFileSync(new URL("../.env.local",import.meta.url),"utf8").split(/\r?\n/).filter(line=>/^[A-Z_]+=/.test(line)).map(line=>{const index=line.indexOf("=");return[line.slice(0,index),line.slice(index+1).trim().replace(/^[\"']|[\"']$/g,"")] }))
const db=createClient(env.NEXT_PUBLIC_SUPABASE_URL,env.SUPABASE_SERVICE_ROLE_KEY,{auth:{persistSession:false,autoRefreshToken:false}})
const users=[],orders=[]
let businessId,branchId,settingsSnapshot,branchSnapshot,hoursSnapshot,browser,failed=false,stage="setup"
const checked=(result,label)=>{if(result.error)throw new Error(`${label}: ${result.error.code??result.error.status??"provider error"}`);return result.data}

async function account(namespace,role=null,email=`qa-loyalty-${randomUUID()}@example.test`){
  const password=`Qa!${randomUUID()}`
  const user=checked(await db.auth.admin.createUser({email,password,email_confirm:true,user_metadata:{full_name:"QA Loyalty - DO NOT FULFILL"}}),"Create QA account").user
  users.push(user.id)
  if(role)checked(await db.from("staff_memberships").insert({business_id:businessId,user_id:user.id,role,is_active:true,permissions_customized:false}),"Create QA staff membership")
  const jar=new Map(),client=createServerClient(env.NEXT_PUBLIC_SUPABASE_URL,env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY,{cookieOptions:{name:namespace,path:"/",sameSite:"lax"},cookies:{getAll:()=>[...jar].map(([name,value])=>({name,value})),setAll:values=>values.forEach(({name,value})=>jar.set(name,value))}})
  checked(await client.auth.signInWithPassword({email,password}),"Sign in QA account")
  return {id:user.id,email,client,cookies:[...jar].map(([name,value])=>({name,value,domain:"localhost",path:"/",sameSite:"Lax"}))}
}

async function createOrder(customerId,email,label){
  const id=randomUUID(),orderNumber=`QA-LOY-${Date.now()}-${orders.length+1}`
  checked(await db.from("orders").insert({id,order_number:orderNumber,business_id:businessId,branch_id:branchId,customer_id:customerId,service_mode:"PICKUP",operational_order_type:"PICKUP",channel:"WEBSITE",status:"RECEIVED",payment_method:"CASH_ON_DELIVERY",payment_status:"UNPAID",customer_name:`${label} - DO NOT FULFILL`,customer_phone:"03000000000",customer_email:email,subtotal:1249,discount:0,delivery_fee:0,tax:0,total:1249,order_notes:"AUTOMATED LOYALTY QA - DO NOT PREPARE"}),`Create ${label} order`)
  orders.push(id)
  for(const status of ["CONFIRMED","PREPARING","READY","DELIVERED"])checked(await db.from("orders").update({status}).eq("id",id).select("id").single(),`${label} -> ${status}`)
  return {id,orderNumber}
}

async function cleanup(){
  if(orders.length){
    const invoices=checked(await db.from("invoices").select("id").in("order_id",orders),"Find QA invoices")
    if(invoices.length)checked(await db.from("invoices").delete().in("id",invoices.map(row=>row.id)),"Delete QA invoices")
    checked(await db.from("orders").delete().in("id",orders),"Delete QA orders")
  }
  if(users.length){
    await db.from("audit_logs").delete().in("actor_id",users)
    await db.from("audit_logs").delete().eq("entity_type","loyalty_wallets").in("entity_id",users)
    await db.from("loyalty_transactions").delete().in("customer_id",users)
    await db.from("loyalty_wallets").delete().in("customer_id",users)
    await db.from("staff_memberships").delete().in("user_id",users)
    for(const id of users)await db.auth.admin.deleteUser(id)
  }
  if(settingsSnapshot)checked(await db.from("loyalty_settings").update({is_enabled:settingsSnapshot.is_enabled,program_name:settingsSnapshot.program_name,coin_name:settingsSnapshot.coin_name,coins_per_100_pkr:settingsSnapshot.coins_per_100_pkr,coin_value_pkr:settingsSnapshot.coin_value_pkr,start_earning_order:settingsSnapshot.start_earning_order,minimum_order_pkr:settingsSnapshot.minimum_order_pkr,max_coins_per_order:settingsSnapshot.max_coins_per_order,loyal_order_threshold:settingsSnapshot.loyal_order_threshold,vip_order_threshold:settingsSnapshot.vip_order_threshold,website_orders_only:settingsSnapshot.website_orders_only,show_earning_message:settingsSnapshot.show_earning_message,redemption_enabled:settingsSnapshot.redemption_enabled,minimum_redeem_coins:settingsSnapshot.minimum_redeem_coins,max_redeem_percent:settingsSnapshot.max_redeem_percent,updated_by:settingsSnapshot.updated_by}).eq("business_id",businessId),"Restore loyalty settings")
  if(branchSnapshot)checked(await db.from("branches").update({temporarily_closed:branchSnapshot.temporarily_closed,online_ordering_enabled:branchSnapshot.online_ordering_enabled,pickup_enabled:branchSnapshot.pickup_enabled}).eq("id",branchId),"Restore branch ordering state")
  if(hoursSnapshot)checked(await db.from("business_hours").update({is_closed:hoursSnapshot.is_closed,opens_at:hoursSnapshot.opens_at,closes_at:hoursSnapshot.closes_at}).eq("id",hoursSnapshot.id),"Restore business hours")
}

try{
  const branch=checked(await db.from("branches").select("id,business_id,city,location_revision,temporarily_closed,online_ordering_enabled,pickup_enabled").eq("id","22222222-2222-4222-8222-222222222222").single(),"Resolve active branch")
  businessId=branch.business_id;branchId=branch.id
  branchSnapshot=branch
  const weekday=["Sun","Mon","Tue","Wed","Thu","Fri","Sat"].indexOf(new Intl.DateTimeFormat("en-US",{timeZone:"Asia/Karachi",weekday:"short"}).format(new Date()))
  hoursSnapshot=checked(await db.from("business_hours").select("id,is_closed,opens_at,closes_at").eq("branch_id",branchId).eq("day_of_week",weekday).single(),"Snapshot today hours")
  settingsSnapshot=checked(await db.from("loyalty_settings").select("*").eq("business_id",businessId).single(),"Snapshot settings")
  checked(await db.from("loyalty_settings").update({is_enabled:true,program_name:"KING'S Rewards",coin_name:"Loyalty Coins",coins_per_100_pkr:1,coin_value_pkr:1,start_earning_order:2,minimum_order_pkr:0,max_coins_per_order:200,loyal_order_threshold:2,vip_order_threshold:3,website_orders_only:true,show_earning_message:true,redemption_enabled:true,minimum_redeem_coins:1,max_redeem_percent:100}).eq("business_id",businessId),"Set deterministic QA rules")

  stage="signed-in award and idempotency"
  const customer=await account("italian-pizza-customer-auth")
  const first=await createOrder(customer.id,customer.email,"QA loyalty first")
  let ledger=checked(await db.from("loyalty_transactions").select("*").eq("business_id",businessId).eq("customer_id",customer.id),"Read first-order ledger")
  assert.equal(ledger.length,0,"First delivered order must not earn before configured threshold")
  let wallet=checked(await db.from("loyalty_wallets").select("*").eq("business_id",businessId).eq("customer_id",customer.id).single(),"Read first wallet")
  assert.equal(wallet.completed_orders,1);assert.equal(wallet.balance_coins,0)
  const second=await createOrder(customer.id,customer.email,"QA loyalty second")
  ledger=checked(await db.from("loyalty_transactions").select("*").eq("order_id",second.id),"Read second-order award")
  assert.equal(ledger.length,1);assert.equal(ledger[0].transaction_type,"EARN");assert.equal(ledger[0].coins,12);assert.equal(ledger[0].pkr_value,12)
  checked(await db.from("orders").update({status:"DELIVERED"}).eq("id",second.id),"Repeat delivered write")
  assert.equal(checked(await db.from("loyalty_transactions").select("id",{count:"exact"}).eq("order_id",second.id),"Recheck idempotency").length,1)
  const customerWallet=checked(await customer.client.rpc("customer_loyalty_wallet",{p_business_id:businessId}),"Customer wallet RPC")
  assert.equal(customerWallet.balanceCoins,12);assert.equal(customerWallet.balancePkr,12);assert.equal(customerWallet.completedOrders,2);assert.equal(customerWallet.tier,"LOYAL")
  const forgedWallet=await customer.client.from("loyalty_wallets").update({balance_coins:999999}).eq("business_id",businessId).eq("customer_id",customer.id).select("balance_coins")
  const forgedLedger=await customer.client.from("loyalty_transactions").insert({business_id:businessId,customer_id:customer.id,transaction_type:"MANUAL_CREDIT",coins:999999,pkr_value:999999,description:"forged"})
  const forgedSettings=await customer.client.from("loyalty_settings").update({coins_per_100_pkr:100}).eq("business_id",businessId).select("coins_per_100_pkr")
  assert.ok(forgedWallet.error||forgedWallet.data?.length===0,"Customer must not update wallet rows");assert.ok(forgedLedger.error,"Customer must not insert ledger rows");assert.ok(forgedSettings.error||forgedSettings.data?.length===0,"Customer must not change reward settings")
  assert.equal(checked(await db.from("loyalty_wallets").select("balance_coins").eq("business_id",businessId).eq("customer_id",customer.id).single(),"Verify forged wallet denial").balance_coins,12)
  assert.equal(checked(await db.from("loyalty_settings").select("coins_per_100_pkr").eq("business_id",businessId).single(),"Verify forged settings denial").coins_per_100_pkr,1)
  console.log("PASS signed-in: first order 0, second delivered order 12 coins, duplicate blocked and direct coin/settings forgery denied")

  stage="server-authoritative redemption and cancellation refund"
  const now=new Date().toISOString()
  const deals=checked(await db.from("deals").select("id,name,deal_price,starts_at,ends_at").eq("business_id",businessId).eq("is_active",true).order("sort_order"),"Find active deal")
  const deal=deals.find(row=>(!row.starts_at||row.starts_at<=now)&&(!row.ends_at||row.ends_at>now));assert.ok(deal,"An active deal is required for redemption QA")
  checked(await db.from("branches").update({temporarily_closed:false,online_ordering_enabled:true,pickup_enabled:true}).eq("id",branchId),"Temporarily open branch for transactional QA")
  checked(await db.from("business_hours").update({is_closed:false,opens_at:"00:00",closes_at:"23:59:59"}).eq("id",hoursSnapshot.id),"Temporarily open hours for transactional QA")
  let redeemed
  try{
    const payload={branchId,serviceMode:"PICKUP",paymentMethod:"CASH_ON_DELIVERY",customerName:"QA Redemption - DO NOT FULFILL",customerPhone:"03000000000",customerEmail:customer.email,loyaltyCoinsToRedeem:5,items:[{itemKind:"deal",productId:deal.id,quantity:1}]}
    const cookieHeader=customer.cookies.map(cookie=>`${cookie.name}=${cookie.value}`).join("; ")
    const response=await fetch(new URL("/api/orders",customerOrigin),{method:"POST",headers:{"Content-Type":"application/json",Cookie:cookieHeader},body:JSON.stringify(payload)});const responseBody=await response.json();assert.equal(response.status,201,`Order API redemption failed: ${responseBody.error??response.status}`);redeemed=responseBody.order
    orders.push(redeemed.id)
    const excessive=await fetch(new URL("/api/orders",customerOrigin),{method:"POST",headers:{"Content-Type":"application/json",Cookie:cookieHeader},body:JSON.stringify({...payload,customerName:"QA Excessive Redemption - DO NOT FULFILL",loyaltyCoinsToRedeem:999})});assert.equal(excessive.status,400,"Server must reject redemption above the wallet balance")
    const directCustomer=await customer.client.rpc("create_order_with_loyalty",{p_payload:payload,p_customer_id:customer.id});assert.ok(directCustomer.error,"Customer browser must not call the privileged order RPC directly")
  }finally{
    checked(await db.from("branches").update({temporarily_closed:branchSnapshot.temporarily_closed,online_ordering_enabled:branchSnapshot.online_ordering_enabled,pickup_enabled:branchSnapshot.pickup_enabled}).eq("id",branchId),"Restore branch after transactional QA")
    checked(await db.from("business_hours").update({is_closed:hoursSnapshot.is_closed,opens_at:hoursSnapshot.opens_at,closes_at:hoursSnapshot.closes_at}).eq("id",hoursSnapshot.id),"Restore hours after transactional QA")
  }
  const redeemedOrder=checked(await db.from("orders").select("order_number,subtotal,discount,total,loyalty_coins_redeemed,loyalty_discount").eq("id",redeemed.id).single(),"Verify redeemed order")
  assert.equal(redeemedOrder.loyalty_coins_redeemed,5);assert.equal(redeemedOrder.loyalty_discount,5);assert.equal(redeemedOrder.discount,5);assert.equal(redeemedOrder.total,Number(deal.deal_price)-5)
  let redemptionLedger=checked(await db.from("loyalty_transactions").select("transaction_type,coins,pkr_value").eq("order_id",redeemed.id).order("created_at"),"Verify redemption ledger")
  assert.deepEqual(redemptionLedger,[{transaction_type:"REDEEM",coins:-5,pkr_value:5}]);assert.equal(checked(await db.from("loyalty_wallets").select("balance_coins").eq("business_id",businessId).eq("customer_id",customer.id).single(),"Wallet after redemption").balance_coins,7)
  const cancelResponse=await fetch(new URL(`/api/orders/${encodeURIComponent(redeemed.orderNumber)}/cancel`,customerOrigin),{method:"POST",headers:{Cookie:customer.cookies.map(cookie=>`${cookie.name}=${cookie.value}`).join("; ")}});assert.equal(cancelResponse.status,200,"Customer cancellation endpoint must accept a received redeemed order")
  redemptionLedger=checked(await db.from("loyalty_transactions").select("transaction_type,coins,pkr_value").eq("order_id",redeemed.id).order("created_at"),"Verify cancellation refund")
  assert.deepEqual(redemptionLedger,[{transaction_type:"REDEEM",coins:-5,pkr_value:5},{transaction_type:"REDEEM_REFUND",coins:5,pkr_value:5}]);const refundedWallet=checked(await db.from("loyalty_wallets").select("balance_coins,lifetime_earned").eq("business_id",businessId).eq("customer_id",customer.id).single(),"Wallet after cancellation");assert.equal(refundedWallet.balance_coins,12);assert.equal(refundedWallet.lifetime_earned,12,"Returned coins must not inflate lifetime earned")
  console.log("PASS redemption: arbitrary coin debit changed the authoritative total; excessive/direct RPC use failed and cancellation returned coins once")

  stage="guest same-email claim"
  const guestEmail=`qa-loyalty-guest-${randomUUID()}@example.test`
  await createOrder(null,guestEmail,"QA guest first")
  const guestSecond=await createOrder(null,guestEmail,"QA guest second")
  let pending=checked(await db.from("loyalty_transactions").select("*").eq("order_id",guestSecond.id).single(),"Read pending guest reward")
  assert.equal(pending.customer_id,null);assert.equal(pending.normalized_email,guestEmail);assert.equal(pending.coins,12)
  const claimed=await account("italian-pizza-customer-auth",null,guestEmail)
  const claimedWallet=checked(await claimed.client.rpc("customer_loyalty_wallet",{p_business_id:businessId}),"Claim same-email reward")
  assert.equal(claimedWallet.balanceCoins,12);assert.equal(claimedWallet.completedOrders,2);assert.equal(claimedWallet.tier,"LOYAL")
  pending=checked(await db.from("loyalty_transactions").select("customer_id,claimed_at").eq("order_id",guestSecond.id).single(),"Verify claim")
  assert.equal(pending.customer_id,claimed.id);assert.ok(pending.claimed_at)
  console.log("PASS guest: pending coins claimed only after verified sign-in with the identical normalized email")

  stage="admin adjustment and reporting"
  const owner=await account("italian-pizza-admin-auth","OWNER")
  let adjusted=checked(await owner.client.rpc("adjust_customer_loyalty",{p_business_id:businessId,p_customer_id:customer.id,p_coins:5,p_note:"Automated QA service credit"}),"Credit wallet")
  assert.equal(adjusted.balanceCoins,17);assert.equal(adjusted.lifetimeEarned,17)
  adjusted=checked(await owner.client.rpc("adjust_customer_loyalty",{p_business_id:businessId,p_customer_id:customer.id,p_coins:-2,p_note:"Automated QA correction"}),"Debit wallet")
  assert.equal(adjusted.balanceCoins,15);assert.equal(adjusted.lifetimeEarned,17)
  const dashboard=checked(await owner.client.rpc("loyalty_admin_dashboard",{p_business_id:businessId}),"Admin loyalty dashboard")
  assert.ok(dashboard.wallets.some(row=>row.customer_id===customer.id&&row.balance_coins===15&&row.completed_orders===2&&row.tier==="LOYAL"))
  const audits=checked(await db.from("audit_logs").select("id").eq("actor_id",owner.id).eq("action","LOYALTY_ADJUSTED"),"Adjustment audit")
  assert.equal(audits.length,2)
  const privateWallet=checked(await customer.client.rpc("customer_loyalty_wallet",{p_business_id:businessId}),"Customer-safe wallet activity")
  assert.ok(!privateWallet.transactions.some(row=>/Automated QA service credit|Automated QA correction/i.test(row.description)),"Internal Admin adjustment reasons must not be customer-visible")
  assert.ok(privateWallet.transactions.some(row=>row.description==="Wallet credit from restaurant")&&privateWallet.transactions.some(row=>row.description==="Wallet correction by restaurant"),"Customer should receive safe adjustment labels")
  console.log("PASS admin: +5/-2 audited adjustments, wallet balance 15, reporting and internal-note privacy")

  if(playwrightPath){
    stage="browser UI"
    const {chromium}=await import(pathToFileURL(playwrightPath).href)
    browser=await chromium.launch({channel:"chrome",headless:true})
    const customerContext=await browser.newContext({viewport:{width:1280,height:900}});await customerContext.addCookies(customer.cookies)
    const page=await customerContext.newPage()
    const browserErrors=[];page.on("console",message=>{if(message.type()==="error")browserErrors.push(message.text())});page.on("pageerror",error=>browserErrors.push(error.message))
    await page.addInitScript(({branchId,city,revision})=>{if(!localStorage.getItem("italian-pizza-demo-state-v2"))localStorage.setItem("italian-pizza-demo-state-v2",JSON.stringify({cart:[],orderType:"pickup",selectedAreaId:null,locationSource:"MANUAL_AREA",coordinates:null,deliveryQuote:null,promoCode:"",promoDiscount:0,branchId,city,locationRevision:revision}))},{branchId,city:branch.city,revision:branch.location_revision})
    await page.goto(customerOrigin,{waitUntil:"domcontentloaded",timeout:90000})
    await page.getByText("You earned 12 Loyalty Coins!",{exact:true}).waitFor({timeout:30000})
    await page.getByRole("link",{name:"View my wallet"}).click()
    await page.getByText("15 Loyalty Coins",{exact:true}).first().waitFor({timeout:30000})
    await page.getByText("PKR wallet value: Rs 15",{exact:true}).waitFor({timeout:30000})
    await page.getByText("LOYAL",{exact:true}).first().waitFor({timeout:30000})
    const adminContext=await browser.newContext({viewport:{width:1440,height:950}});await adminContext.addCookies(owner.cookies)
    const adminPage=await adminContext.newPage();await adminPage.goto(new URL("/loyalty",adminOrigin).href,{waitUntil:"domcontentloaded",timeout:90000})
    await adminPage.getByRole("heading",{name:"Loyalty & Wallet",exact:true}).waitFor({timeout:30000})
    await adminPage.getByRole("heading",{name:"Reward rules",exact:true}).waitFor({timeout:30000})
    await adminPage.getByText(customer.email,{exact:true}).waitFor({timeout:30000})
    await adminPage.locator("label").filter({hasText:"Coins per Rs 100 spent"}).locator("input").fill("2")
    await adminPage.getByRole("button",{name:"Save settings",exact:true}).click()
    await adminPage.getByText("Loyalty settings saved and published to the website.",{exact:true}).waitFor({timeout:30000})
    assert.equal(checked(await db.from("loyalty_settings").select("coins_per_100_pkr").eq("business_id",businessId).single(),"Verify browser settings save").coins_per_100_pkr,2)
    const walletRow=adminPage.locator("tr").filter({hasText:customer.email})
    await walletRow.getByRole("button",{name:"Adjust",exact:true}).click()
    await adminPage.getByLabel("Coins",{exact:true}).fill("1")
    await adminPage.locator("label").filter({hasText:"Internal reason"}).locator("textarea").fill("Browser QA adjustment")
    await adminPage.getByRole("button",{name:"Apply adjustment",exact:true}).click()
    await adminPage.getByText("Customer wallet adjusted and audit logged.",{exact:true}).waitFor({timeout:30000})
    await walletRow.getByText("16 coins",{exact:true}).waitFor({timeout:30000})
    const walletResponse=await customerContext.request.get(new URL("/api/loyalty",customerOrigin).href);assert.equal(walletResponse.status(),200,"Loyalty API must be available during checkout");const walletPayload=await walletResponse.json();assert.equal(walletPayload.wallet?.enabled,true);assert.equal(walletPayload.wallet?.redemptionEnabled,true);assert.equal(walletPayload.wallet?.balanceCoins,16)
    await page.evaluate(({branchId,city,revision,deal})=>{localStorage.setItem("italian-pizza-demo-state-v2",JSON.stringify({cart:[{lineId:"qa-loyalty-cart",itemKind:"deal",productId:deal.id,name:deal.name,unitPrice:Number(deal.deal_price),quantity:1,options:[],image:"/images/products/deal-placeholder.svg"}],orderType:"pickup",selectedAreaId:null,locationSource:"MANUAL_AREA",coordinates:null,deliveryQuote:null,promoCode:"",promoDiscount:0,branchId,city,locationRevision:revision}))},{branchId,city:branch.city,revision:branch.location_revision,deal})
    await page.goto(new URL("/checkout",customerOrigin).href,{waitUntil:"domcontentloaded",timeout:90000})
    await page.getByRole("heading",{name:"Complete your order",exact:true}).waitFor({timeout:30000})
    await page.getByRole("heading",{name:"Use loyalty coins",exact:true}).waitFor({timeout:30000})
    await page.getByRole("button",{name:"Use maximum",exact:true}).click()
    await page.getByText("Save Rs 16",{exact:true}).waitFor({timeout:30000})
    assert.ok(await page.locator(".loyalty-redemption-card").evaluate(node=>node.getBoundingClientRect().height)<120,"Loyalty redemption must remain compact")
    await page.locator(".price-summary").getByText("Loyalty coins",{exact:true}).waitFor({timeout:30000})
    await page.locator(".price-summary__total").getByText(`Rs ${(Number(deal.deal_price)-16).toLocaleString("en-PK")}`,{exact:true}).waitFor({timeout:30000})
    const masterSwitch=adminPage.locator(".loyalty-master-switch input");await masterSwitch.uncheck();await adminPage.getByRole("button",{name:"Save settings",exact:true}).click();await adminPage.getByText("Loyalty program paused and removed from the customer website.",{exact:true}).waitFor({timeout:30000})
    await page.reload({waitUntil:"domcontentloaded",timeout:90000});await page.waitForTimeout(1200);assert.equal(await page.getByRole("heading",{name:"Use loyalty coins",exact:true}).count(),0,"Master OFF must remove loyalty redemption from checkout")
    await page.goto(new URL("/account#loyalty",customerOrigin).href,{waitUntil:"domcontentloaded",timeout:90000});await page.waitForTimeout(1200);assert.equal(await page.locator("#loyalty").count(),0,"Master OFF must remove loyalty wallet from account")
    assert.ok(!browserErrors.some(message=>/button.*button|hydration failed|hydration error/i.test(message)),`Hydration/invalid nesting errors remained: ${browserErrors.join(" | ")}`)
    console.log("PASS browser: earned wallet, selectable checkout redemption, live total, Admin ON/OFF visibility and zero nested-button hydration errors")
    await customerContext.close();await adminContext.close()
  }else console.log("SKIP browser UI: pass Playwright module path as argument to include UI verification")

  assert.ok(first.id&&second.id)
}catch(error){failed=true;console.error(`FAIL ${stage}: ${error instanceof Error?error.message:"loyalty verification failed"}`)}finally{
  if(browser)await browser.close().catch(()=>{})
  try{await cleanup();console.log("RESTORED: original settings and all QA loyalty users/orders/wallets/audits removed")}
  catch(error){failed=true;console.error(`CLEANUP FAIL: ${error instanceof Error?error.message:"unknown cleanup error"}`)}
}
if(failed)process.exitCode=1
