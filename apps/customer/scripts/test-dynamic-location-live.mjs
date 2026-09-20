import assert from "node:assert/strict"
import { randomUUID } from "node:crypto"
import { pathToFileURL } from "node:url"
import { createClient } from "@supabase/supabase-js"
import { createServerClient } from "@supabase/ssr"

process.loadEnvFile(new URL("../../../apps/backend/.env.local", import.meta.url))
const env=process.env
const url=env.NEXT_PUBLIC_SUPABASE_URL??env.SUPABASE_URL
const anon=env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY
const db=createClient(url,env.SUPABASE_SERVICE_ROLE_KEY,{auth:{persistSession:false,autoRefreshToken:false}})
const {chromium}=await import(pathToFileURL(process.argv[2]).href)
const browser=await chromium.launch({channel:"chrome",headless:true})
const branchId="22222222-2222-4222-8222-222222222222"
let userId

const check=(result,label)=>{if(result.error)throw new Error(`${label}: ${result.error.code}`);return result.data}
try{
  const branch=check(await db.from("branches").select("id,business_id,name,restaurant_name,city,formatted_address,latitude,longitude,location_revision").eq("id",branchId).single(),"branch")
  assert.equal(branch.restaurant_name,"KING'S CAFE")
  assert.equal(branch.city,"Islamabad")
  const areas=check(await db.from("delivery_areas").select("name,slug,city,is_active,provider_place_id").eq("branch_id",branchId),"areas")
  assert.ok(areas.some(area=>area.is_active&&area.name==="H-11"&&area.city==="Islamabad"))
  assert.equal(areas.filter(area=>area.is_active&&area.city!=="Islamabad").length,0)

  const email=`qa-dynamic-${randomUUID()}@example.test`,password=`Qa!${randomUUID()}`
  userId=check(await db.auth.admin.createUser({email,password,email_confirm:true}),"user").user.id
  check(await db.from("staff_memberships").insert({business_id:branch.business_id,user_id:userId,role:"OWNER",is_active:true}),"membership")
  const jar=new Map()
  const staff=createServerClient(url,anon,{cookieOptions:{name:"italian-pizza-admin-auth",path:"/",sameSite:"lax"},cookies:{getAll:()=>[...jar].map(([name,value])=>({name,value})),setAll:items=>items.forEach(({name,value})=>jar.set(name,value))}})
  check(await staff.auth.signInWithPassword({email,password}),"sign in")
  const admin=await browser.newContext({viewport:{width:1440,height:1000}})
  await admin.addCookies([...jar].map(([name,value])=>({name,value,domain:"localhost",path:"/",sameSite:"Lax"})))
  await admin.addCookies([{name:"ip-admin-branch",value:branchId,domain:"localhost",path:"/",sameSite:"Lax"}])
  const adminPage=await admin.newPage();const adminTiles=[]
  adminPage.on("response",response=>{if(response.url().includes("maps.geoapify.com/v1/tile/"))adminTiles.push(response.status())})
  await adminPage.goto("http://localhost:3001/delivery",{waitUntil:"domcontentloaded",timeout:90000})
  await adminPage.getByRole("heading",{name:"Restaurant Location"}).waitFor({timeout:60000})
  await adminPage.getByText("KING'S CAFE",{exact:true}).first().waitFor()
  if (await adminPage.getByLabel("Active branch").inputValue() === "all") { await adminPage.getByLabel("Active branch").selectOption(branchId); await adminPage.waitForTimeout(1500) }
  assert.match(await adminPage.getByLabel("Active branch").locator("option:checked").innerText(),/KING'S CAFE.*Islamabad/)
  assert.equal(await adminPage.getByLabel("Main city / region").inputValue(),"Islamabad")
  assert.equal(await adminPage.getByLabel("Restaurant name").inputValue(),"KING'S CAFE")
  await adminPage.locator(".leaflet-container").first().waitFor()
  await adminPage.waitForTimeout(2500)
  assert.ok(adminTiles.some(status=>status===200),"Admin numbered tile did not return 200")
  await adminPage.screenshot({path:"docs/qa-dynamic-admin-islamabad.png",fullPage:true})

  const product=check(await db.from("products").select("id,name,base_price").eq("business_id",branch.business_id).eq("is_active",true).limit(1).single(),"product")
  const customer=await browser.newContext({viewport:{width:390,height:844},geolocation:{latitude:33.6543909,longitude:73.0091541},permissions:["geolocation"]})
  await customer.addInitScript(({branchId,product})=>{if(sessionStorage.getItem("qa-dynamic-fixture"))return;sessionStorage.setItem("qa-dynamic-fixture","1");localStorage.setItem("italian-pizza-demo-state-v2",JSON.stringify({branchId,city:"Tarbela Ghazi",locationRevision:1,orderType:"delivery",selectedAreaId:"sobra-city",locationSource:"MANUAL_AREA",coordinates:{latitude:34.01,longitude:72.65,source:"MAP_PIN"},cart:[{lineId:"qa-dynamic",productId:product.id,name:product.name,unitPrice:product.base_price,quantity:1,image:"/favicon.ico",options:[],modifierSelections:[]}]}))},{branchId,product})
  const page=await customer.newPage();const customerTiles=[]
  page.on("response",response=>{if(response.url().includes("maps.geoapify.com/v1/tile/"))customerTiles.push(response.status())})
  await page.goto("http://localhost:3000/",{waitUntil:"domcontentloaded",timeout:90000})
  const dialog=page.getByRole("dialog");await dialog.waitFor({timeout:60000})
  await dialog.getByText("KING'S CAFE",{exact:true}).first().waitFor()
  assert.equal(await dialog.getByLabel("City / region").inputValue(),"Islamabad")
  assert.equal(await dialog.getByText("Sobra City",{exact:true}).count(),0)
  await dialog.getByRole("combobox").click();await dialog.getByLabel("Search supported delivery areas").fill("H-11")
  await dialog.getByRole("option",{name:/H-11/}).click();await dialog.getByRole("button",{name:"Select",exact:true}).click()
  await dialog.waitFor({state:"hidden"})
  await page.locator("strong:visible",{hasText:"H-11, Islamabad"}).first().waitFor()
  await page.waitForFunction(()=>{const saved=JSON.parse(localStorage.getItem("italian-pizza-demo-state-v2")||"{}");return saved.selectedAreaId==="h-11-b78853"&&saved.city==="Islamabad"&&saved.locationRevision===2})
  assert.equal(await dialog.isVisible(),false,"Location dialog remained open after area confirmation")
  await page.goto("http://localhost:3000/checkout",{waitUntil:"domcontentloaded",timeout:90000})
  await page.getByRole("heading",{name:"Complete your order"}).waitFor({timeout:60000})
  const input=page.getByRole("combobox",{name:"Search delivery address"});await input.click();await input.fill("")
  const autocompleteResponse=page.waitForResponse(response=>response.url().includes("/api/location/autocomplete?")&&response.url().includes("H-11"),{timeout:30000})
  await input.pressSequentially("H-11 Islamabad",{delay:35})
  assert.equal((await autocompleteResponse).status(),200)
  const option=page.locator(".address-suggestions button").filter({hasText:"H-11"}).first();await option.waitFor({timeout:30000});await option.click()
  await page.getByText(/We deliver here|Delivery area updated to H-11/).waitFor({timeout:30000})
  await page.locator(".leaflet-container").waitFor();await page.waitForTimeout(2000)
  assert.ok(customerTiles.some(status=>status===200),"Customer numbered tile did not return 200")
  await page.getByRole("button",{name:"Use Current Location"}).click()
  await page.getByText("We deliver here.",{exact:true}).waitFor({timeout:30000})
  const map=page.locator(".leaflet-container").first();const box=await map.boundingBox();assert.ok(box)
  const mapReverse=page.waitForResponse(response=>response.url().includes("/api/location/reverse")&&response.status()===200,{timeout:30000})
  await page.mouse.click(box.x+box.width/2,box.y+box.height/2)
  await mapReverse
  const route=await page.request.get("http://localhost:3000/api/location/route?latitude=33.6543909&longitude=73.0091541&areaId=h-11-b78853")
  assert.equal(route.status(),200);const quote=await route.json();assert.ok(quote.distanceKm<10)
  const outside=await page.request.get("http://localhost:3000/api/location/route?latitude=33.738&longitude=73.39&areaId=h-11-b78853")
  assert.equal(outside.status(),422)
  await page.screenshot({path:"docs/qa-dynamic-customer-islamabad.png",fullPage:true})
  console.log(JSON.stringify({admin:{sidebar:true,branchSelector:true,city:true,tile200:true},customer:{staleSelectionInvalidated:true,modalIdentity:"KING'S CAFE",city:"Islamabad",area:"H-11",addressReconciled:true,tile200:true},routing:{distanceKm:quote.distanceKm,deliveryFee:quote.deliveryFee,outsideStatus:outside.status()}}))
}finally{
  await browser.close()
  if(userId)await db.auth.admin.deleteUser(userId)
}
