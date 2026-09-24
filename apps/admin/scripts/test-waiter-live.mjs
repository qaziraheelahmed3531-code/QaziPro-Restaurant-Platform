// Live waiter workflow QA. Creates one disposable WAITER and one labelled POS
// table order, verifies attribution/permissions, then removes every fixture.
import assert from "node:assert/strict"
import { randomUUID } from "node:crypto"
import { readFileSync } from "node:fs"
import { createClient } from "@supabase/supabase-js"
import { createServerClient } from "@supabase/ssr"

const origin=process.argv[2]??"http://localhost:3001"
assert.equal(new URL(origin).hostname,"localhost")
const env=Object.fromEntries(readFileSync(new URL("../.env.local",import.meta.url),"utf8").split(/\r?\n/).filter(line=>/^[A-Z_]+=/.test(line)).map(line=>{const index=line.indexOf("=");return[line.slice(0,index),line.slice(index+1).trim().replace(/^["']|["']$/g,"")] }))
const db=createClient(env.NEXT_PUBLIC_SUPABASE_URL,env.SUPABASE_SERVICE_ROLE_KEY,{auth:{persistSession:false,autoRefreshToken:false}})
const email=`qa-waiter-${randomUUID()}@example.test`,password=`Qa!${randomUUID()}`
let userId,membershipId,orderId,ownerUserId,hoursSnapshot
let failed=false
const checked=(result,label)=>{if(result.error)throw new Error(`${label}: ${result.error.code??result.error.status??"provider error"} ${String(result.error.message??"").slice(0,180)}`);return result.data}

try{
  const branch=checked(await db.from("branches").select("id,business_id,restaurant_name,name,city").eq("id","22222222-2222-4222-8222-222222222222").single(),"Resolve restaurant")
  const timezone=checked(await db.from("businesses").select("timezone").eq("id",branch.business_id).single(),"Resolve timezone").timezone
  const weekdayName=new Intl.DateTimeFormat("en-US",{timeZone:timezone,weekday:"short"}).format(new Date())
  const weekday=["Sun","Mon","Tue","Wed","Thu","Fri","Sat"].indexOf(weekdayName)
  hoursSnapshot=checked(await db.from("business_hours").select("branch_id,day_of_week,opens_at,closes_at,is_closed").eq("branch_id",branch.id).eq("day_of_week",weekday).single(),"Snapshot business hours")
  checked(await db.from("business_hours").update({opens_at:"00:00:00",closes_at:"23:59:59",is_closed:false}).eq("branch_id",branch.id).eq("day_of_week",weekday),"Open restaurant for disposable QA")
  const product=checked(await db.from("products").select("id,name,base_price,sale_price").eq("business_id",branch.business_id).eq("is_active",true).eq("is_available",true).order("sort_order").limit(1).single(),"Resolve live product")
  const assignments=checked(await db.from("product_modifier_groups").select("modifier_groups(id,min_selections,modifier_options(id,price_adjustment,is_active,is_default,sort_order))").eq("product_id",product.id).order("sort_order"),"Resolve product options")
  const modifiers=assignments.flatMap(assignment=>{const group=Array.isArray(assignment.modifier_groups)?assignment.modifier_groups[0]:assignment.modifier_groups;if(!group)return[];return(group.modifier_options??[]).filter(option=>option.is_active).sort((a,b)=>Number(b.is_default)-Number(a.is_default)||a.sort_order-b.sort_order).slice(0,group.min_selections).map(option=>({groupId:group.id,optionId:option.id}))})
  const created=checked(await db.auth.admin.createUser({email,password,email_confirm:true,user_metadata:{full_name:"QA Waiter — DO NOT FULFILL"}}),"Create waiter account")
  userId=created.user.id
  const membership=checked(await db.from("staff_memberships").insert({business_id:branch.business_id,branch_id:branch.id,user_id:userId,role:"WAITER",is_active:true,permissions_customized:false}).select("id").single(),"Create waiter membership")
  membershipId=membership.id
  checked(await db.from("staff_membership_branches").insert({membership_id:membershipId,business_id:branch.business_id,branch_id:branch.id}),"Assign waiter branch")
  const jar=new Map()
  const waiter=createServerClient(env.NEXT_PUBLIC_SUPABASE_URL,env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY,{cookieOptions:{name:"italian-pizza-admin-auth",path:"/",sameSite:"lax"},cookies:{getAll:()=>[...jar].map(([name,value])=>({name,value})),setAll:values=>values.forEach(({name,value})=>jar.set(name,value))}})
  checked(await waiter.auth.signInWithPassword({email,password}),"Sign in waiter")
  const sent=checked(await waiter.rpc("create_waiter_pos_order",{p_payload:{branchId:branch.id,tableReference:"QA TABLE — DO NOT FULFILL",guestName:"QA Guest",notes:"AUTOMATED QA — DO NOT PREPARE",items:[{itemKind:"product",productId:product.id,quantity:1,modifiers}]}}),"Send waiter order")
  orderId=sent.id
  const saved=checked(await db.from("orders").select("id,order_number,channel,operational_order_type,waiter_id,waiter_name,table_reference,status,payment_status,total,order_items(product_name,quantity,line_total)").eq("id",orderId).single(),"Verify POS order")
  assert.equal(saved.channel,"POS")
  assert.equal(saved.operational_order_type,"DINE_IN")
  assert.equal(saved.waiter_id,userId)
  assert.equal(saved.status,"CONFIRMED")
  assert.equal(saved.payment_status,"UNPAID")
  assert.equal(saved.table_reference,"QA TABLE — DO NOT FULFILL")
  assert.equal(saved.order_items[0].product_name,product.name)
  assert.equal(saved.total,Number(product.sale_price??product.base_price)+modifiers.reduce((sum,selection)=>sum+Number(assignments.flatMap(a=>{const g=Array.isArray(a.modifier_groups)?a.modifier_groups[0]:a.modifier_groups;return g?.modifier_options??[]}).find(option=>option.id===selection.optionId)?.price_adjustment??0),0))
  const dashboard=checked(await waiter.rpc("waiter_dashboard",{p_branch_id:branch.id}),"Waiter dashboard")
  assert.ok(dashboard.recentOrders.some(order=>order.id===orderId))
  const ownerEmail=`qa-waiter-owner-${randomUUID()}@example.test`,ownerPassword=`Qa!${randomUUID()}`
  ownerUserId=checked(await db.auth.admin.createUser({email:ownerEmail,password:ownerPassword,email_confirm:true,user_metadata:{full_name:"QA Waiter Report Owner"}}),"Create report owner").user.id
  checked(await db.from("staff_memberships").insert({business_id:branch.business_id,user_id:ownerUserId,role:"OWNER",is_active:true}),"Create report owner membership")
  const ownerJar=new Map(),owner=createServerClient(env.NEXT_PUBLIC_SUPABASE_URL,env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY,{cookieOptions:{name:"italian-pizza-admin-auth",path:"/",sameSite:"lax"},cookies:{getAll:()=>[...ownerJar].map(([name,value])=>({name,value})),setAll:values=>values.forEach(({name,value})=>ownerJar.set(name,value))}})
  checked(await owner.auth.signInWithPassword({email:ownerEmail,password:ownerPassword}),"Sign in report owner")
  const performance=checked(await owner.rpc("waiter_performance",{p_business_id:branch.business_id}),"Owner waiter performance")
  assert.ok(performance.some(row=>row.user_id===userId&&row.order_count===1&&Number(row.total_sales)===saved.total))
  const forbidden=await waiter.rpc("settle_waiter_pos_order",{p_order_id:orderId,p_shift_id:randomUUID(),p_cash_received:saved.total})
  assert.ok(forbidden.error,"Waiter must not settle cashier payments")
  const cookie=[...jar].map(([name,value])=>`${name}=${value}`).join("; ")
  const waiterPage=await fetch(new URL("/waiter",origin),{headers:{Cookie:cookie},redirect:"manual",signal:AbortSignal.timeout(45000)})
  assert.equal(waiterPage.status,200,"WAITER route must be available")
  assert.match(await waiterPage.text(),/Waiter tablet|Search products or SKU/i)
  const posPage=await fetch(new URL("/pos",origin),{headers:{Cookie:cookie},redirect:"manual",signal:AbortSignal.timeout(45000)})
  const posBody=await posPage.text()
  assert.ok(!posBody.includes("Point of sale")&&(posPage.status>=300||posBody.includes("NEXT_REDIRECT")),"WAITER must be denied cashier POS")
  console.log(`PASS: ${saved.order_number} created as attributed, unpaid DINE_IN POS order; waiter dashboard/report updated and cashier access stayed denied`)
}catch(error){failed=true;console.error(`FAIL: ${error instanceof Error?error.message:"waiter verification failed"}`)}finally{
  if(hoursSnapshot)await db.from("business_hours").update({opens_at:hoursSnapshot.opens_at,closes_at:hoursSnapshot.closes_at,is_closed:hoursSnapshot.is_closed}).eq("branch_id",hoursSnapshot.branch_id).eq("day_of_week",hoursSnapshot.day_of_week)
  if(orderId){await db.from("audit_logs").delete().eq("entity_id",orderId);await db.from("orders").delete().eq("id",orderId)}
  if(userId)await db.from("audit_logs").delete().eq("actor_id",userId)
  if(membershipId)await db.from("staff_memberships").delete().eq("id",membershipId)
  if(userId)await db.auth.admin.deleteUser(userId)
  if(ownerUserId){await db.from("audit_logs").delete().eq("actor_id",ownerUserId);await db.from("staff_memberships").delete().eq("user_id",ownerUserId);await db.auth.admin.deleteUser(ownerUserId)}
  console.log("Disposable waiter, membership and QA table order removed; no email was sent.")
}
if(failed)process.exitCode=1
