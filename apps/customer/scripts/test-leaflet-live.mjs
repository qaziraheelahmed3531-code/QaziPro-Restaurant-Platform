import assert from 'node:assert/strict'
import {pathToFileURL} from 'node:url'
import {randomUUID} from 'node:crypto'
import {createClient} from '@supabase/supabase-js'
import {createServerClient} from '@supabase/ssr'
process.loadEnvFile(new URL('../.env.local',import.meta.url))
const env=process.env,db=createClient(env.NEXT_PUBLIC_SUPABASE_URL,env.SUPABASE_SERVICE_ROLE_KEY,{auth:{persistSession:false,autoRefreshToken:false}})
const {chromium}=await import(pathToFileURL(process.argv[2]).href)
const browser=await chromium.launch({channel:'chrome',headless:true})
const check=(r)=>{if(r.error)throw new Error('Database check: '+r.error.code);return r.data}
let userId
try {
 const branch=check(await db.from('branches').select('id,business_id,latitude,longitude,city,location_revision').eq('id','22222222-2222-4222-8222-222222222222').single())
 const area=check(await db.from('delivery_areas').select('id,slug,center_lat,center_lng').eq('branch_id',branch.id).eq('is_active',true).not('center_lat','is',null).not('center_lng','is',null).order('sort_order').limit(1).single())
 const inside={latitude:Number(area.center_lat),longitude:Number(area.center_lng)}
 const email=`qa-map-${randomUUID()}@example.com`,password='Qa!'+randomUUID()
 userId=check(await db.auth.admin.createUser({email,password,email_confirm:true})).user.id
 const membership=check(await db.from('staff_memberships').insert({business_id:branch.business_id,branch_id:branch.id,user_id:userId,role:'MANAGER',is_active:true,permissions_customized:true}).select('id').single())
 check(await db.from('staff_membership_permissions').insert({membership_id:membership.id,permission_code:'delivery.manage'}))
 const jar=new Map(),staff=createServerClient(env.NEXT_PUBLIC_SUPABASE_URL,env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY,{cookieOptions:{name:'italian-pizza-admin-auth',path:'/',sameSite:'lax'},cookies:{getAll:()=>[...jar].map(([name,value])=>({name,value})),setAll:items=>items.forEach(({name,value})=>jar.set(name,value))}})
 check(await staff.auth.signInWithPassword({email,password}))
 const context=await browser.newContext({viewport:{width:1440,height:1000},geolocation:inside,permissions:['geolocation']})
 await context.addCookies([...jar].map(([name,value])=>({name,value,domain:'localhost',path:'/',sameSite:'Lax'})))
 if(process.argv[3] !== 'customer') {
 for(const mode of ['address','search']){
   const response=await context.request.get(`http://localhost:3001/api/delivery/discover?mode=${mode}&q=JFC%20Ghazi%20tarbela&latitude=${branch.latitude}&longitude=${branch.longitude}`)
   assert.equal(response.status(),200);const data=await response.json();console.log(JSON.stringify({test:'JFC '+mode,candidates:data.candidates.map(c=>({name:c.name,address:c.formattedAddress,lat:c.lat,lon:c.lon}))}))
 }
 const page=await context.newPage()
 page.on('response',r=>{if(r.url().includes('maps.geoapify.com'))console.log('Geoapify tile HTTP '+r.status())})
 page.on('requestfailed',r=>{if(r.url().includes('maps.geoapify.com'))console.log('Tile request failed: '+r.failure()?.errorText)})
 await page.goto('http://localhost:3001/delivery',{waitUntil:'domcontentloaded',timeout:90000})
 await page.locator('.leaflet-container').first().waitFor({timeout:45000})
 const tiles=await page.waitForFunction(()=>[...document.querySelectorAll('.leaflet-tile')].some(i=>i.complete&&i.naturalWidth>0),null,{timeout:15000}).then(()=>true).catch(()=>false)
 console.log(tiles?'PASS Admin Leaflet tiles render':'BLOCKED tile rendering; inspect provider status')
 const map=page.locator('.leaflet-container').first()
 const reverse=page.waitForResponse(r=>r.url().includes('/api/delivery/discover?mode=reverse')&&r.status()===200)
 await map.click({position:{x:150,y:150}});await reverse;console.log('PASS Admin map click reverse lookup')
 const pin=page.locator('.leaflet-marker-icon').first(),box=await pin.boundingBox();assert.ok(box)
 const drag=page.waitForResponse(r=>r.url().includes('/api/delivery/discover?mode=reverse')&&r.status()===200,{timeout:8000}).catch(()=>null)
 await page.mouse.move(box.x+16,box.y+16);await page.mouse.down();await page.mouse.move(box.x+55,box.y+40,{steps:8});await page.mouse.up();await drag
 console.log((await drag)?'PASS Admin drag-end reverse lookup':'PARTIAL Admin drag not verified')
 const gps=page.waitForResponse(r=>r.url().includes('/api/delivery/discover?mode=reverse')&&r.status()===200)
 await page.getByRole('button',{name:/Use current location/i}).click();await gps;console.log('PASS Admin simulated browser GPS; physical GPS not tested')
 await page.screenshot({path:'docs/qa-leaflet-admin.png',fullPage:true})
 // No branch save: do not persist simulated GPS as the real restaurant origin.
 }
 const customer=await browser.newContext({viewport:{width:390,height:844},geolocation:inside,permissions:['geolocation']})
 const product=check(await db.from('products').select('id,name,base_price').eq('business_id',branch.business_id).limit(1).single())
 await customer.addInitScript(({p,branch,area})=>localStorage.setItem('italian-pizza-demo-state-v2',JSON.stringify({orderType:'delivery',selectedAreaId:area.slug,branchId:branch.id,city:branch.city,locationRevision:branch.location_revision,cart:[{lineId:'qa-location-only',productId:p.id,name:p.name,unitPrice:p.base_price,quantity:1,image:'/favicon.ico',options:[],modifierSelections:[]}]})),{p:product,branch,area})
 const cp=await customer.newPage();await cp.goto('http://localhost:3000/checkout',{waitUntil:'domcontentloaded',timeout:90000});await cp.getByRole('heading',{name:'Complete your order'}).waitFor({timeout:60000})
 console.log('Checkout-only QA with browser cart fixture; not an ordering E2E')
 await cp.locator('.leaflet-container').waitFor()
 const checkoutForm=cp.locator('#checkout-form')
 const locationDialog=cp.getByRole('dialog')
 if(await locationDialog.isVisible().catch(()=>false)) {
   await locationDialog.getByRole('button',{name:'Use Current Location',exact:true}).click()
   const start=locationDialog.getByRole('button',{name:'Start ordering',exact:true})
   await start.waitFor({state:'visible'});await start.click({timeout:45000})
   await locationDialog.waitFor({state:'hidden'})
 }
 const quote=cp.waitForResponse(r=>r.url().includes('/api/location/route?')&&r.status()===200,{timeout:45000})
 await checkoutForm.getByRole('button',{name:'Use Current Location',exact:true}).click()
 const q=await (await quote).json();console.log(JSON.stringify({test:'Customer GPS route',origin:{lat:branch.latitude,lon:branch.longitude},destination:{lat:inside.latitude,lon:inside.longitude},quote:q}))
 assert.ok(q.distanceKm<20);assert.ok(Number.isFinite(q.deliveryFee)&&q.deliveryFee>=0)
 assert.equal(await cp.locator('.address-card').getByText('City / region',{exact:true}).count(),0)
 await cp.getByRole('button',{name:'Save address',exact:true}).click();await cp.getByText('Home address saved.',{exact:true}).waitFor();console.log('PASS guest current-order address save')
 await cp.screenshot({path:'docs/qa-leaflet-checkout-390.png',fullPage:true})
 await customer.setGeolocation({latitude:24.8607,longitude:67.0011});await checkoutForm.getByRole('button',{name:'Use Current Location',exact:true}).click()
 await cp.waitForTimeout(3000);console.log('Outside status: '+await cp.locator('.checkout-pin-status').innerText())
 await cp.waitForFunction(()=>document.querySelector('.checkout-pin-status')?.textContent.includes('Sorry, this location is outside our delivery area.'),null,{timeout:30000})
 assert.equal(await cp.locator('aside button[type=submit]').isDisabled(),true);console.log('PASS outside-zone compact error and disabled order')
 const customerJar=new Map(),signed=createServerClient(env.NEXT_PUBLIC_SUPABASE_URL,env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY,{cookieOptions:{name:'italian-pizza-customer-auth',path:'/',sameSite:'lax'},cookies:{getAll:()=>[...customerJar].map(([name,value])=>({name,value})),setAll:items=>items.forEach(({name,value})=>customerJar.set(name,value))}})
 check(await signed.auth.signInWithPassword({email,password}));await customer.addCookies([...customerJar].map(([name,value])=>({name,value,domain:'localhost',path:'/',sameSite:'Lax'})))
 const save=await customer.request.post('http://localhost:3000/api/addresses',{data:{label:'home',addressLine1:'QA mapped address',deliveryAreaId:area.id,latitude:inside.latitude,longitude:inside.longitude,locationSource:'MAP_PIN'}})
 assert.equal(save.status(),200);const saved=await save.json();assert.ok(saved.id)
 const addresses=await customer.request.get('http://localhost:3000/api/addresses');assert.ok((await addresses.json()).addresses.some(a=>a.id===saved.id))
 console.log('PASS authenticated address persists and reloads through scoped API')
 await customer.request.delete('http://localhost:3000/api/addresses?id='+saved.id)
 await customer.close();await context.close()
} catch(error){console.error('FAIL '+error.message);process.exitCode=1}
finally{if(userId)await db.auth.admin.deleteUser(userId);await browser.close();console.log('Temporary QA account removed; no orders created or branch origin changed.')}
