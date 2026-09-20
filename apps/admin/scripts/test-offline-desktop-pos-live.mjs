// Reversible live QA for the offline desktop POS sync boundary. It creates a
// disposable cashier/device/order, verifies idempotency, replacement and price
// tamper rejection, then removes every fixture.
import assert from "node:assert/strict"
import { randomUUID } from "node:crypto"
import { readFileSync } from "node:fs"
import { createClient } from "@supabase/supabase-js"

const env=Object.fromEntries(readFileSync(new URL("../.env.local",import.meta.url),"utf8").split(/\r?\n/).filter(line=>/^[A-Z_]+=/.test(line)).map(line=>{const index=line.indexOf("=");return[line.slice(0,index),line.slice(index+1).trim().replace(/^["']|["']$/g,"")] }))
const service=createClient(env.NEXT_PUBLIC_SUPABASE_URL,env.SUPABASE_SERVICE_ROLE_KEY,{auth:{persistSession:false,autoRefreshToken:false}})
const checked=(result,label)=>{if(result.error)throw new Error(`${label}: ${result.error.message}${result.error.details?` | ${result.error.details}`:""}${result.error.hint?` | ${result.error.hint}`:""}`);return result.data}
const email=`qa-offline-pos-${randomUUID()}@example.test`,password=`Qa!${randomUUID()}`,deviceId=randomUUID(),offlineOrderId=randomUUID(),offlineShiftId=randomUUID()
let userId,businessId,branchId,orderId,shiftId,snapshotId;let failed=false

try{
  const branch=checked(await service.from("branches").select("id,business_id").eq("is_active",true).limit(1).single(),"Resolve branch")
  branchId=branch.id;businessId=branch.business_id
  const deal=checked(await service.from("deals").select("id,name,deal_price").eq("business_id",businessId).eq("is_active",true).limit(1).single(),"Resolve active deal")
  userId=checked(await service.auth.admin.createUser({email,password,email_confirm:true,user_metadata:{full_name:"QA Offline POS"}}),"Create cashier").user.id
  checked(await service.from("staff_memberships").insert({business_id:businessId,branch_id:branchId,user_id:userId,role:"CASHIER",is_active:true}),"Create cashier membership")
  const cashier=createClient(env.NEXT_PUBLIC_SUPABASE_URL,env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY,{auth:{persistSession:false,autoRefreshToken:false}})
  checked(await cashier.auth.signInWithPassword({email,password}),"Sign in cashier")
  snapshotId=checked(await cashier.rpc("register_desktop_pos_catalog",{p_branch_id:branchId,p_device_id:deviceId,p_device_name:"QA Counter - disposable",p_app_version:"0.1.0"}),"Register catalog")
  const now=new Date().toISOString(),price=Number(deal.deal_price)
  const base={deviceId,catalogVersionId:snapshotId,offlineOrderId,offlineShiftId,soldAt:now,branchId,openingCash:5000,shiftOpenedAt:now,shiftClosedAt:null,countedCash:null,customerName:"QA Offline - DO NOT FULFILL",customerPhone:"Counter",notes:"Automated offline sync verification",orderType:"TAKEAWAY",tableReference:"",cashReceived:price,items:[{itemKind:"deal",productId:deal.id,name:deal.name,quantity:1,unitBasePrice:price,unitModifierPrice:0,unitPrice:price,modifiers:[]}],replacement:null}
  const first=checked(await cashier.rpc("sync_offline_pos_order",{p_payload:base}),"Upload offline sale")
  orderId=first.id
  assert.equal(first.idempotent,false)
  const repeated=checked(await cashier.rpc("sync_offline_pos_order",{p_payload:base}),"Retry same offline sale")
  assert.equal(repeated.id,orderId);assert.equal(repeated.idempotent,true)
  const saved=checked(await service.from("orders").select("id,channel,operational_order_type,status,payment_status,total,offline_device_id,offline_order_id,catalog_snapshot_id,order_items(quantity,unit_price,line_total)").eq("id",orderId).single(),"Verify saved order")
  assert.equal(saved.channel,"POS");assert.equal(saved.status,"CONFIRMED");assert.equal(saved.payment_status,"PAID");assert.equal(saved.total,price);assert.equal(saved.offline_device_id,deviceId);assert.equal(saved.catalog_snapshot_id,snapshotId)
  const paymentCount=checked(await service.from("payment_transactions").select("id",{count:"exact"}).eq("order_id",orderId),"Count payments")
  assert.equal(paymentCount.length,1)
  const forged={...base,offlineOrderId:randomUUID(),items:[{...base.items[0],unitBasePrice:price+1,unitPrice:price+1}],cashReceived:price+1}
  const forgedResult=await cashier.rpc("sync_offline_pos_order",{p_payload:forged})
  assert.ok(forgedResult.error);assert.match(forgedResult.error.message,/downloaded catalog/i)
  const replacement={...base,cashReceived:price*2,items:[{...base.items[0],quantity:2}],replacement:{reason:"QA customer changed quantity",oldItems:base.items,oldTotal:price,createdAt:new Date().toISOString()}}
  const replaced=checked(await cashier.rpc("sync_offline_pos_order",{p_payload:replacement}),"Sync replacement")
  assert.equal(replaced.replaced,true);assert.equal(replaced.total,price*2)
  const replacementRows=checked(await service.from("pos_order_replacements").select("old_total,new_total,cash_adjustment").eq("order_id",orderId),"Verify replacement audit")
  assert.equal(replacementRows.length,1);assert.deepEqual(replacementRows[0],{old_total:price,new_total:price*2,cash_adjustment:price})
  const finalPayment=checked(await service.from("payment_transactions").select("id,amount,shift_id").eq("order_id",orderId).single(),"Verify reconciled cash")
  assert.equal(finalPayment.amount,price*2);shiftId=finalPayment.shift_id
  const cancelled=checked(await cashier.rpc("cancel_pos_order",{p_order_id:orderId,p_reason:"Automated Desktop POS cancellation verification"}),"Cancel replaced POS sale")
  assert.equal(cancelled.status,"CANCELLED");assert.equal(cancelled.idempotent,false)
  const repeatedCancellation=checked(await cashier.rpc("cancel_pos_order",{p_order_id:orderId,p_reason:"Duplicate cancellation verification"}),"Retry cancellation")
  assert.equal(repeatedCancellation.status,"CANCELLED");assert.equal(repeatedCancellation.idempotent,true)
  const cancelledOrder=checked(await service.from("orders").select("status,payment_status,cancelled_by,cancel_reason").eq("id",orderId).single(),"Verify cancelled order")
  assert.equal(cancelledOrder.status,"CANCELLED");assert.equal(cancelledOrder.payment_status,"REFUNDED");assert.equal(cancelledOrder.cancelled_by,"ADMIN")
  const cancellationRefunds=checked(await service.from("refunds").select("amount,status,cash_shift_id").eq("order_id",orderId),"Verify cancellation refund")
  assert.equal(cancellationRefunds.reduce((sum,row)=>sum+Number(row.amount),0),price*2);assert.ok(cancellationRefunds.every(row=>row.status==="SUCCEEDED"&&row.cash_shift_id===shiftId))
  const device=checked(await service.from("pos_offline_devices").select("last_catalog_at,last_sync_at,is_active").eq("id",deviceId).single(),"Verify device heartbeat")
  assert.ok(device.last_catalog_at&&device.last_sync_at&&device.is_active)
  console.log(`PASS: offline POS idempotency, forged-price rejection, one-time replacement, cancellation refund and duplicate-cancel safety all verified at Rs ${price*2}.`)
}catch(error){failed=true;console.error(`FAIL: ${error instanceof Error?error.message:"offline desktop POS verification failed"}`)}finally{
  if(orderId){await service.from("audit_logs").delete().eq("entity_id",orderId);await service.from("notifications").delete().eq("entity_id",orderId);await service.from("pos_order_replacements").delete().eq("order_id",orderId);await service.from("refunds").delete().eq("order_id",orderId);await service.from("payment_transactions").delete().eq("order_id",orderId);await service.from("invoices").delete().eq("order_id",orderId);await service.from("orders").delete().eq("id",orderId)}
  await service.from("audit_logs").delete().eq("entity_id",deviceId)
  if(shiftId)await service.from("register_shifts").delete().eq("id",shiftId)
  if(snapshotId)await service.from("pos_catalog_snapshots").delete().eq("id",snapshotId)
  await service.from("pos_offline_devices").delete().eq("id",deviceId)
  if(userId){await service.from("staff_memberships").delete().eq("user_id",userId);await service.from("audit_logs").delete().eq("actor_id",userId);await service.auth.admin.deleteUser(userId)}
  console.log("Disposable cashier, device, shift and order fixtures removed.")
}
if(failed)process.exitCode=1
