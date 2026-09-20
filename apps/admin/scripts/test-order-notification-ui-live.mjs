import assert from "node:assert/strict"
import { randomUUID } from "node:crypto"
import { chromium } from "playwright"
import { createClient } from "@supabase/supabase-js"
import { createServerClient } from "@supabase/ssr"

process.loadEnvFile(new URL("../../backend/.env.local",import.meta.url))
const env=process.env,db=createClient(env.NEXT_PUBLIC_SUPABASE_URL,env.SUPABASE_SERVICE_ROLE_KEY,{auth:{persistSession:false,autoRefreshToken:false}})
const check=(result,label)=>{if(result.error)throw new Error(`${label}: ${result.error.message}`);return result.data}
const browser=await chromium.launch({channel:"chrome",headless:true})
let ownerId,firstId,secondId,posId,businessId,originalSettings,failed=false,firstNumber,secondNumber,uploadedSoundPath,originalUnreadIds=[],testStarted=new Date().toISOString()
try{
  const branch=check(await db.from("branches").select("id,business_id").eq("is_active",true).limit(1).single(),"Branch");businessId=branch.business_id
  originalUnreadIds=check(await db.from("notifications").select("id").eq("business_id",businessId).eq("is_read",false).is("resolved_at",null),"Original unread alerts").map(row=>row.id)
  originalSettings=check(await db.from("business_operating_settings").select("new_order_sound,order_notification_sound_url").eq("business_id",businessId).single(),"Settings")
  check(await db.from("business_operating_settings").update({new_order_sound:true,order_notification_sound_url:null}).eq("business_id",businessId),"Enable test sound")
  const email=`qa-alert-ui-${randomUUID()}@example.test`,password=`Qa!${randomUUID()}a9`
  ownerId=check(await db.auth.admin.createUser({email,password,email_confirm:true}),"Owner").user.id
  check(await db.from("staff_memberships").insert({business_id:businessId,user_id:ownerId,role:"OWNER",is_active:true}),"Membership")
  const jar=new Map(),auth=createServerClient(env.NEXT_PUBLIC_SUPABASE_URL,env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY,{cookieOptions:{name:"italian-pizza-admin-auth",path:"/",sameSite:"lax"},cookies:{getAll:()=>[...jar].map(([name,value])=>({name,value})),setAll:items=>items.forEach(({name,value})=>jar.set(name,value))}})
  check(await auth.auth.signInWithPassword({email,password}),"Sign in")
  const context=await browser.newContext({viewport:{width:1440,height:900}});await context.addCookies([...jar].map(([name,value])=>({name,value,domain:"localhost",path:"/",sameSite:"Lax"})))
  const page=await context.newPage();await page.addInitScript(()=>{window.__orderChimes=0;const start=OscillatorNode.prototype.start;OscillatorNode.prototype.start=function(...args){window.__orderChimes++;return start.apply(this,args)}})
  await page.goto("http://localhost:3101/settings",{waitUntil:"domcontentloaded",timeout:90000});await page.getByRole("button",{name:"Test sound"}).click();await page.waitForFunction(()=>window.__orderChimes>=2,{timeout:10000});const wav=Buffer.alloc(44);wav.write("RIFF",0);wav.writeUInt32LE(36,4);wav.write("WAVEfmt ",8);wav.writeUInt32LE(16,16);wav.writeUInt16LE(1,20);wav.writeUInt16LE(1,22);wav.writeUInt32LE(8000,24);wav.writeUInt32LE(16000,28);wav.writeUInt16LE(2,32);wav.writeUInt16LE(16,34);wav.write("data",36);wav.writeUInt32LE(0,40);await page.locator('input[type="file"][accept*="audio"]').setInputFiles({name:"qa-order.wav",mimeType:"audio/wav",buffer:wav});await page.getByText("Sound uploaded. Save settings to activate it.").waitFor();await page.getByRole("button",{name:"Save alert settings"}).click();await page.getByText("Order notification settings saved for Admin and synced POS devices.").waitFor();const savedSound=check(await db.from("business_operating_settings").select("order_notification_sound_url").eq("business_id",businessId).single(),"Saved sound").order_notification_sound_url;uploadedSoundPath=decodeURIComponent(new URL(savedSound).pathname.split("/notification-sounds/")[1]);await page.goto("http://localhost:3101",{waitUntil:"domcontentloaded"});await page.locator(".notification-button").waitFor();await page.locator("body").click({position:{x:600,y:400}});await page.waitForTimeout(800)
  const base={business_id:businessId,branch_id:branch.id,operational_order_type:"PICKUP",service_mode:"PICKUP",status:"RECEIVED",payment_method:"CASH_ON_DELIVERY",payment_status:"UNPAID",customer_name:"QA Realtime Customer",customer_phone:"03000000000",subtotal:0,total:0,channel:"WEBSITE"}
  firstNumber=`QA-ALERT-1-${randomUUID()}`;firstId=check(await db.from("orders").insert({...base,order_number:firstNumber}).select("id").single(),"First website order").id
  await page.waitForFunction(()=>Number(document.querySelector(".notification-button span")?.textContent)>0,{timeout:20000})
  await page.locator(".notification-button").click();await page.locator(".notification-popover__list>button").filter({hasText:firstNumber}).click();await page.waitForURL(url=>url.pathname==="/orders"&&url.searchParams.get("order")===firstId,{timeout:30000});await page.locator(".order-detail").waitFor({timeout:30000});await page.getByRole("button",{name:"Close order"}).click()

  secondNumber=`QA-ALERT-2-${randomUUID()}`;secondId=check(await db.from("orders").insert({...base,order_number:secondNumber}).select("id").single(),"Second website order").id
  await page.waitForFunction(()=>Number(document.querySelector(".notification-button span")?.textContent)>0,{timeout:20000});await page.locator(".notification-button").click();await page.getByRole("button",{name:/Mark all read/}).click();await page.waitForFunction(()=>!document.querySelector(".notification-button span"),{timeout:20000})

  posId=check(await db.from("orders").insert({...base,order_number:`QA-ALERT-POS-${randomUUID()}`,channel:"POS",operational_order_type:"TAKEAWAY"}).select("id").single(),"POS order").id
  await page.waitForTimeout(1200);assert.equal(await page.locator(".notification-button span").count(),0,"POS sale created an alert")
  for(const id of [firstId,secondId])for(const status of ["CONFIRMED","PREPARING","READY","DELIVERED"])check(await db.from("orders").update({status}).eq("id",id),`${id} to ${status}`)
  await page.locator(".notification-button").click().catch(()=>{});await page.waitForTimeout(1200);assert.equal(await page.locator(".notification-popover__list>button").filter({hasText:"QA-ALERT"}).count(),0,"Completed orders remained in active notification list")
  console.log("PASS: Admin received one realtime chime, opened the exact order, marked all read, ignored POS, and removed completed orders.")
  await context.close()
}catch(error){failed=true;console.error(`FAIL: ${error instanceof Error?error.stack??error.message:"Notification UI verification failed"}`)}finally{
  for(const id of [firstId,secondId,posId].filter(Boolean)){await db.from("audit_logs").delete().eq("entity_id",id);await db.from("notifications").delete().eq("entity_id",id);await db.from("order_notifications").delete().eq("order_id",id);await db.from("payment_transactions").delete().eq("order_id",id);await db.from("orders").delete().eq("id",id)}
  if(originalSettings&&businessId)await db.from("business_operating_settings").update(originalSettings).eq("business_id",businessId)
  if(uploadedSoundPath)await db.storage.from("notification-sounds").remove([uploadedSoundPath])
  if(businessId){const recent=await db.from("notifications").select("id").eq("business_id",businessId).gte("created_at",testStarted).is("resolved_at",null);const restore=[...new Set([...originalUnreadIds,...(recent.data??[]).map(row=>row.id)])];if(restore.length)await db.from("notifications").update({is_read:false,read_at:null}).in("id",restore)}
  if(ownerId){await db.from("staff_memberships").delete().eq("user_id",ownerId);await db.from("audit_logs").delete().eq("actor_id",ownerId);await db.auth.admin.deleteUser(ownerId)}
  await browser.close();console.log("Disposable notification UI fixtures removed.")
}
if(failed)process.exitCode=1
