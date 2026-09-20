// Reversible browser acceptance test for the compact navigation and storefront boot skeleton.
import assert from "node:assert/strict"
import { tmpdir } from "node:os"
import { join } from "node:path"
import { randomUUID } from "node:crypto"
import { createClient } from "@supabase/supabase-js"
import { createServerClient } from "@supabase/ssr"
import { chromium } from "playwright"

process.loadEnvFile(new URL("../../backend/.env.local",import.meta.url))
const env=process.env
const db=createClient(env.NEXT_PUBLIC_SUPABASE_URL,env.SUPABASE_SERVICE_ROLE_KEY,{auth:{persistSession:false,autoRefreshToken:false}})
const check=(result,label)=>{if(result.error)throw new Error(`${label}: ${result.error.message}`);return result.data}
const browser=await chromium.launch({channel:"chrome",headless:true})
let ownerId
try{
  const branch=check(await db.from("branches").select("id,business_id").eq("is_active",true).order("sort_order").limit(1).single(),"Active branch")
  const email=`qa-small-ui-${randomUUID()}@example.test`,password=`Qa!${randomUUID()}a9`
  ownerId=check(await db.auth.admin.createUser({email,password,email_confirm:true}),"Create owner").user.id
  check(await db.from("staff_memberships").insert({business_id:branch.business_id,user_id:ownerId,role:"OWNER",is_active:true}),"Create membership")
  const jar=new Map(),auth=createServerClient(env.NEXT_PUBLIC_SUPABASE_URL,env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY,{cookieOptions:{name:"italian-pizza-admin-auth",path:"/",sameSite:"lax"},cookies:{getAll:()=>[...jar].map(([name,value])=>({name,value})),setAll:items=>items.forEach(({name,value})=>jar.set(name,value))}})
  check(await auth.auth.signInWithPassword({email,password}),"Sign in")
  const adminContext=await browser.newContext({viewport:{width:1440,height:900}})
  await adminContext.addCookies([...jar].map(([name,value])=>({name,value,domain:"localhost",path:"/",sameSite:"Lax"})))
  await adminContext.addCookies([{name:"ip-admin-branch",value:branch.id,domain:"localhost",path:"/",sameSite:"Lax"}])
  const admin=await adminContext.newPage(),adminErrors=[];admin.on("pageerror",error=>adminErrors.push(error.message))
  await admin.goto("http://localhost:3001/register",{waitUntil:"domcontentloaded",timeout:90000})
  await admin.getByRole("heading",{name:"Register & shifts",exact:true}).waitFor({timeout:30000})
  const operationLabels=await admin.locator(".nav-group").filter({hasText:"Operations"}).locator(".nav-group__items a>span").allTextContents()
  assert.deepEqual(operationLabels.slice(0,7),["POS / Counter","Orders","Kitchen","Register / Shifts","Waiter Tablet","Rider Portal","Offline Desktop POS"])
  await admin.getByRole("button",{name:"Collapse navigation",exact:true}).click()
  await admin.locator(".admin-shell.is-sidebar-collapsed").waitFor()
  await admin.waitForFunction(()=>document.querySelector(".admin-sidebar")?.getBoundingClientRect().width<=82)
  const compact=await admin.evaluate(()=>({sidebar:document.querySelector(".admin-sidebar")?.getBoundingClientRect().width,labelDisplay:getComputedStyle(document.querySelector(".admin-nav a>span")).display,contentLeft:document.querySelector(".admin-main")?.getBoundingClientRect().left}))
  assert.ok(compact.sidebar>=70&&compact.sidebar<=82);assert.equal(compact.labelDisplay,"none");assert.ok(compact.contentLeft<=82)
  await admin.screenshot({path:join(tmpdir(),"qazipro-sidebar-collapsed.png"),fullPage:false})
  await admin.getByRole("button",{name:"Expand navigation",exact:true}).click();await admin.locator(".admin-shell.is-sidebar-collapsed").waitFor({state:"detached"});assert.deepEqual(adminErrors,[])
  await adminContext.close()

  const customerContext=await browser.newContext({viewport:{width:390,height:844}})
  await customerContext.addInitScript(()=>localStorage.setItem("italian-pizza-demo-state-v2",JSON.stringify({cart:[],orderType:"pickup",selectedAreaId:null,locationSource:"MANUAL_AREA",coordinates:null,deliveryQuote:null,promoCode:"",promoDiscount:0,branchId:null,city:"",locationRevision:0})))
  const customer=await customerContext.newPage(),customerErrors=[];customer.on("pageerror",error=>customerErrors.push(error.message))
  await customer.goto("http://localhost:3000",{waitUntil:"domcontentloaded",timeout:90000})
  const boot=customer.locator(".storefront-skeleton.is-boot-overlay");await boot.waitFor({state:"visible",timeout:5000})
  await customer.screenshot({path:join(tmpdir(),"qazipro-startup-skeleton.png"),fullPage:false})
  assert.equal(await boot.locator(".storefront-skeleton__logo").count(),1);assert.equal(await boot.locator(".storefront-skeleton__location").count(),1);assert.equal(await boot.locator(".storefront-skeleton__hero").count(),1);assert.equal(await boot.locator(".storefront-skeleton__search").count(),1);assert.equal(await boot.locator(".storefront-skeleton__banner").count(),1);assert.equal(await boot.locator(".storefront-skeleton__products article").count(),4)
  await boot.waitFor({state:"detached",timeout:5000});await customer.locator(".home-page").waitFor({timeout:30000});assert.equal(await customer.evaluate(()=>document.documentElement.scrollWidth>innerWidth),false);assert.deepEqual(customerErrors,[])
  await customer.goto("http://localhost:3000/orders",{waitUntil:"domcontentloaded",timeout:90000});assert.equal(await customer.locator(".storefront-skeleton.is-boot-overlay").count(),0)
  await customerContext.close()
  console.log(JSON.stringify({adminSidebarCollapse:"PASS",operationsOrder:"PASS",startupSkeletonExactStructure:"PASS",startupOnly:"PASS",mobileNoOverflow:"PASS"}))
}finally{
  if(ownerId){await db.from("audit_logs").delete().eq("actor_id",ownerId);await db.from("staff_memberships").delete().eq("user_id",ownerId);await db.auth.admin.deleteUser(ownerId)}
  await browser.close()
}
