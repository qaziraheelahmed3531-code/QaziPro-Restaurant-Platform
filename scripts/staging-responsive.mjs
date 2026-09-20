import assert from "node:assert/strict"
import { existsSync } from "node:fs"
import { chromium } from "playwright"
import ssr from "../apps/admin/node_modules/@supabase/ssr/dist/main/index.js"

const { createServerClient } = ssr

const required=["STAGING_SUPABASE_URL","STAGING_SUPABASE_PUBLISHABLE_KEY","STAGING_QA_PASSWORD"]
for(const name of required)if(!process.env[name])throw new Error(`${name} is required`)
if(!/staging/i.test(process.env.STAGING_ENVIRONMENT??""))throw new Error("Refusing to run without STAGING_ENVIRONMENT=staging.")
const installedChrome=["C:/Program Files/Google/Chrome/Application/chrome.exe","C:/Program Files (x86)/Google/Chrome/Application/chrome.exe"].find(existsSync)
const browser=await chromium.launch({headless:true,...(installedChrome?{executablePath:installedChrome}:{})})
const results=[]
const sizes=[[360,800],[390,844],[768,1024],[1024,768],[1440,900],[1920,1080],[844,390]]

async function measure(page,label){
  const value=await page.evaluate(()=>{const overflow=document.documentElement.scrollWidth>innerWidth+1;return{viewport:innerWidth,scrollWidth:document.documentElement.scrollWidth,cls:globalThis.__qaCls??0,longTasks:globalThis.__qaLongTasks??0,offenders:overflow?[...document.querySelectorAll("body *")].filter(node=>{const box=node.getBoundingClientRect();return box.width>0&&box.right>innerWidth+2&&getComputedStyle(node).position!=="fixed"}).sort((a,b)=>b.getBoundingClientRect().right-a.getBoundingClientRect().right).slice(0,12).map(node=>({tag:node.tagName,class:String(node.className).slice(0,120),left:Math.round(node.getBoundingClientRect().left),right:Math.round(node.getBoundingClientRect().right),width:Math.round(node.getBoundingClientRect().width)})):[]}})
  assert.ok(value.scrollWidth<=value.viewport+1,`${label}: horizontal overflow ${value.scrollWidth}/${value.viewport}; ${JSON.stringify(value.offenders)}`)
  assert.ok(value.cls<=0.1,`${label}: CLS ${value.cls} exceeds 0.1`)
  results.push({label,...value})
}

async function contextWithMetrics(options={}){
  const context=await browser.newContext(options)
  await context.addInitScript(()=>{
    globalThis.__qaCls=0;globalThis.__qaLongTasks=0
    new PerformanceObserver(list=>{for(const entry of list.getEntries())if(!entry.hadRecentInput)globalThis.__qaCls+=entry.value}).observe({type:"layout-shift",buffered:true})
    try{new PerformanceObserver(list=>{globalThis.__qaLongTasks+=list.getEntries().length}).observe({type:"longtask",buffered:true})}catch{}
  })
  return context
}

try{
  const customer=await contextWithMetrics({extraHTTPHeaders:{"x-forwarded-host":"restaurant-a.staging.qazipro.com","x-qazipro-branch-id":"a0000000-0000-4000-8000-000000000101"}})
  const page=await customer.newPage();const customerErrors=[];page.on("pageerror",error=>customerErrors.push(error.message))
  for(const route of ["/","/cart","/checkout","/account","/orders"]){
    await page.goto(`http://localhost:3100${route}`,{waitUntil:"domcontentloaded",timeout:120000})
    await page.waitForTimeout(350)
    for(const [width,height] of sizes){await page.setViewportSize({width,height});await page.waitForTimeout(80);await measure(page,`customer ${route} ${width}x${height}`)}
  }
  assert.deepEqual(customerErrors,[],`customer runtime errors: ${customerErrors.join("; ")}`)
  await customer.close()

  const jar=new Map()
  const auth=createServerClient(process.env.STAGING_SUPABASE_URL,process.env.STAGING_SUPABASE_PUBLISHABLE_KEY,{cookieOptions:{name:"italian-pizza-admin-auth",path:"/",sameSite:"lax"},cookies:{getAll:()=>[...jar].map(([name,value])=>({name,value})),setAll:items=>items.forEach(({name,value})=>jar.set(name,value))}})
  const signIn=await auth.auth.signInWithPassword({email:"a-owner@staging.qazipro.invalid",password:process.env.STAGING_QA_PASSWORD})
  if(signIn.error)throw signIn.error
  const admin=await contextWithMetrics()
  await admin.addCookies([...jar].map(([name,value])=>({name,value,domain:"localhost",path:"/",sameSite:"Lax"})))
  await admin.addCookies([{name:"ip-admin-branch",value:"a0000000-0000-4000-8000-000000000101",domain:"localhost",path:"/",sameSite:"Lax"}])
  const adminPage=await admin.newPage();const adminErrors=[];adminPage.on("pageerror",error=>adminErrors.push(error.message))
  for(const route of ["/","/pos","/orders","/kitchen","/reports","/pos-sections","/printing","/settings"]){
    await adminPage.goto(`http://localhost:3101${route}`,{waitUntil:"domcontentloaded",timeout:120000});await adminPage.locator(".admin-content").waitFor({timeout:60000})
    for(const [width,height] of [[360,800],[768,1024],[1440,900],[844,390]]){await adminPage.setViewportSize({width,height});await adminPage.waitForTimeout(450);await measure(adminPage,`admin ${route} ${width}x${height}`)}
  }
  assert.deepEqual(adminErrors,[],`admin runtime errors: ${adminErrors.join("; ")}`)
  await admin.close()

  const desktop=await contextWithMetrics();await desktop.addInitScript(()=>Object.defineProperty(navigator,"onLine",{get:()=>false}))
  const pos=await desktop.newPage();const desktopErrors=[];pos.on("pageerror",error=>desktopErrors.push(error.message))
  await pos.goto("http://127.0.0.1:5174",{waitUntil:"domcontentloaded"});await pos.locator(".login-card").waitFor()
  await pos.evaluate(async()=>{const {db}=await import("/src/db.ts");const now=new Date().toISOString();await db.catalogs.put({branchId:"qa-responsive",businessId:"qa-responsive-business",catalogVersionId:"qa-responsive-v1",branchName:"STAGING QA Responsive",city:"Islamabad",businessName:"STAGING QA Restaurant",logoUrl:null,logoDataUrl:null,faviconUrl:null,faviconDataUrl:null,primaryColor:"#a92114",secondaryColor:"#e7a81a",replacementWindowMinutes:15,recentOrderLimit:10,desktopOrderSound:false,orderNotificationSoundUrl:null,orderNotificationSoundDataUrl:null,paymentMethods:[{id:"cash",code:"CASH",name:"Cash",kind:"CASH",requiresReference:false,sortOrder:0}],categories:[{id:"food",name:"Food"}],products:Array.from({length:24},(_,index)=>({id:`qa-${index}`,categoryId:"food",name:`STAGING QA Product ${index+1}`,sku:null,price:500+index,imageUrl:null,imageDataUrl:null,groups:[],variants:[]})),deals:[],updatedAt:now});await db.shifts.put({id:"qa-responsive-shift",branchId:"qa-responsive",status:"OPEN",openingCash:0,openedAt:now,closedAt:null,countedCash:null,syncedAt:null});await db.settings.put({key:"locked",value:"false"})})
  await pos.reload();await pos.locator(".premium-pos").waitFor()
  await pos.locator(".product").first().click()
  for(const [width,height] of sizes){await pos.setViewportSize({width,height});await pos.waitForTimeout(100);await measure(pos,`desktop POS ${width}x${height}`);const checkout=pos.locator(".cart-summary .primary");await checkout.scrollIntoViewIfNeeded();assert.ok(await checkout.isVisible(),`desktop checkout unavailable at ${width}x${height}`)}
  assert.deepEqual(desktopErrors,[],`desktop runtime errors: ${desktopErrors.join("; ")}`)
  await desktop.close()
  console.log(JSON.stringify({ok:true,checks:results.length,results},null,2))
}finally{await browser.close()}
