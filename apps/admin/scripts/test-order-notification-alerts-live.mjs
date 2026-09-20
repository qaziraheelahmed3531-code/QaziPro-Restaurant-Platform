import assert from "node:assert/strict"
import { randomUUID } from "node:crypto"
import { readFileSync } from "node:fs"
import { createClient } from "@supabase/supabase-js"

const env=Object.fromEntries(readFileSync(new URL("../.env.local",import.meta.url),"utf8").split(/\r?\n/).filter(line=>/^[A-Z_]+=/.test(line)).map(line=>{const i=line.indexOf("=");return [line.slice(0,i),line.slice(i+1).trim().replace(/^["']|["']$/g,"")] }))
const db=createClient(env.NEXT_PUBLIC_SUPABASE_URL,env.SUPABASE_SERVICE_ROLE_KEY,{auth:{persistSession:false,autoRefreshToken:false}})
const checked=(result,label)=>{if(result.error)throw new Error(`${label}: ${result.error.message}`);return result.data}
const suffix=randomUUID(),websiteNumber=`QA-NOTIFY-WEB-${suffix}`,posNumber=`QA-NOTIFY-POS-${suffix}`
let websiteId,posId,failed=false

try{
  const branch=checked(await db.from("branches").select("id,business_id").eq("is_active",true).limit(1).single(),"Resolve branch")
  const base={business_id:branch.business_id,branch_id:branch.id,operational_order_type:"PICKUP",service_mode:"PICKUP",status:"RECEIVED",payment_method:"CASH_ON_DELIVERY",payment_status:"UNPAID",customer_name:"QA Notification Customer",customer_phone:"03000000000",subtotal:0,total:0}
  websiteId=checked(await db.from("orders").insert({...base,order_number:websiteNumber,channel:"WEBSITE"}).select("id").single(),"Create website order").id
  const webNotices=checked(await db.from("notifications").select("id,notification_type,is_read,resolved_at,entity_id").eq("business_id",branch.business_id).eq("entity_id",websiteId),"Read website notice")
  assert.equal(webNotices.length,1,"A real website order must create exactly one alert")
  assert.equal(webNotices[0].notification_type,"NEW_ORDER")
  assert.equal(webNotices[0].is_read,false)
  assert.equal(webNotices[0].resolved_at,null)

  posId=checked(await db.from("orders").insert({...base,order_number:posNumber,channel:"POS",operational_order_type:"TAKEAWAY"}).select("id").single(),"Create POS order").id
  const posNotices=checked(await db.from("notifications").select("id").eq("business_id",branch.business_id).eq("entity_id",posId),"Read POS notice")
  assert.equal(posNotices.length,0,"Counter/POS sales must never create website-order alerts")

  for(const status of ["CONFIRMED","PREPARING","READY","DELIVERED"])
    checked(await db.from("orders").update({status}).eq("id",websiteId),`Advance website order to ${status}`)
  const resolved=checked(await db.from("notifications").select("is_read,resolved_at").eq("entity_id",websiteId).single(),"Read resolved alert")
  assert.equal(resolved.is_read,true)
  assert.ok(resolved.resolved_at,"Completed order alert must leave the active queue")
  console.log("PASS: genuine website insert created one alert; POS created none; completed website order resolved automatically.")
}catch(error){failed=true;console.error(`FAIL: ${error instanceof Error?error.message:"Order notification verification failed"}`)}finally{
  for(const id of [websiteId,posId].filter(Boolean)){await db.from("audit_logs").delete().eq("entity_id",id);await db.from("notifications").delete().eq("entity_id",id);await db.from("order_notifications").delete().eq("order_id",id);await db.from("payment_transactions").delete().eq("order_id",id);await db.from("orders").delete().eq("id",id)}
  console.log("Disposable notification fixtures removed.")
}
if(failed)process.exitCode=1
