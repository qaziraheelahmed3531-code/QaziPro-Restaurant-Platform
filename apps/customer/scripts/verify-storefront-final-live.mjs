// Read/permission/receipt QA. No new orders. Inactive social fixture is removed.
import assert from 'node:assert/strict'
import {randomUUID} from 'node:crypto'
import {pathToFileURL} from 'node:url'
import {createClient} from '@supabase/supabase-js'
import {createServerClient} from '@supabase/ssr'
process.loadEnvFile(new URL('../.env.local',import.meta.url))
const env=process.env,db=createClient(env.NEXT_PUBLIC_SUPABASE_URL,env.SUPABASE_SERVICE_ROLE_KEY,{auth:{persistSession:false,autoRefreshToken:false}})
const {chromium}=await import(pathToFileURL(process.argv[2]).href),browser=await chromium.launch({channel:'chrome',headless:true})
const check=(r,label)=>{if(r.error)throw new Error(label+' code '+r.error.code);return r.data}
let userId,socialId,width,businessId,failed=false
try{
 const branch=check(await db.from('branches').select('id,business_id,city,google_locality,google_place_id,latitude,longitude,formatted_address').eq('id','22222222-2222-4222-8222-222222222222').single(),'Branch');businessId=branch.business_id
 // Restore only the service-city value changed by our previous exact-place UI test.
 if(branch.city==='Khalo'&&branch.google_place_id==='ChIJ2dynfAD_3jgROrGsE5z2Hw4')check(await db.from('branches').update({city:'Tarbela Ghazi',google_locality:'Khalo'}).eq('id',branch.id).eq('city','Khalo'),'Restore service city after QA')
 const email=`qa-verify-${randomUUID()}@example.com`,password='Qa!'+randomUUID()
 userId=check(await db.auth.admin.createUser({email,password,email_confirm:true}),'QA account').user.id
 const membership=check(await db.from('staff_memberships').insert({business_id:businessId,branch_id:branch.id,user_id:userId,role:'MANAGER',is_active:true,permissions_customized:true}).select('id').single(),'QA membership')
 check(await db.from('staff_membership_permissions').insert(['delivery.manage','social.manage','orders.read','receipts.print'].map(permission_code=>({membership_id:membership.id,permission_code}))),'Exact QA permissions')
 const jar=new Map(),staff=createServerClient(env.NEXT_PUBLIC_SUPABASE_URL,env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY,{cookieOptions:{name:'italian-pizza-admin-auth',path:'/',sameSite:'lax'},cookies:{getAll:()=>[...jar].map(([name,value])=>({name,value})),setAll:items=>items.forEach(({name,value})=>jar.set(name,value))}})
 check(await staff.auth.signInWithPassword({email,password}),'QA sign-in')
 const context=await browser.newContext({viewport:{width:1440,height:1000}});await context.addCookies([...jar].map(([name,value])=>({name,value,domain:'localhost',path:'/',sameSite:'Lax'})))
 const search=await context.request.get('http://localhost:3001/api/delivery/google?mode=search&q=JFC%20Ghazi%20tarbela&latitude=34.013528&longitude=72.652506');assert.equal(search.status(),200);const exact=(await search.json()).candidates.find(c=>c.providerPlaceId===branch.google_place_id);assert.ok(exact);console.log('PASS authenticated Admin Google Text Search fallback resolves exact JFC ID')
 const anonymous=createClient(env.NEXT_PUBLIC_SUPABASE_URL,env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY,{auth:{persistSession:false,autoRefreshToken:false}})
 assert.ok((await anonymous.rpc('save_restaurant_origin',{p_branch_id:branch.id,p_location:{}})).error);console.log('PASS anonymous restaurant-origin mutation denied')
 check(await staff.rpc('save_restaurant_origin',{p_branch_id:branch.id,p_location:{city:exact.city,country_code:exact.countryCode,country_name:exact.countryName,region:exact.region,postal_code:exact.postalCode,formatted_address:exact.formattedAddress,latitude:Number(branch.latitude),longitude:Number(branch.longitude),google_place_id:branch.google_place_id}}),'Scoped origin save')
 const saved=check(await db.from('branches').select('city,google_locality').eq('id',branch.id).single(),'Separate service city');assert.equal(saved.city,'Tarbela Ghazi');assert.equal(saved.google_locality,'Khalo');console.log('PASS Google locality saved separately; operational service city remains Tarbela Ghazi')
 const reverse=await context.request.get('http://localhost:3001/api/delivery/discover?mode=reverse&latitude=34.0539699&longitude=72.6372917&countryCode=pk&city=Tarbela%20Ghazi');assert.equal(reverse.status(),200);assert.ok((await reverse.json()).candidates.length);console.log('PASS Admin Geoapify reverse fallback returns a real address')
 const fixture=check(await staff.from('social_links').insert({business_id:businessId,platform:'X',url:'',is_active:false,sort_order:999}).select('id').single(),'Inactive platform save');socialId=fixture.id
 assert.equal(check(await anonymous.from('social_links').select('id').eq('id',socialId),'Public inactive lookup').length,0)
 const invalid=await staff.from('social_links').update({is_active:true}).eq('id',socialId);assert.equal(invalid.error?.code,'23514');console.log('PASS inactive blank social saves; anonymous cannot see it; enabled blank rejected by database')
 check(await staff.from('social_links').delete().eq('id',socialId),'Remove hidden QA social');socialId=undefined
 const page=await context.newPage();await page.goto('http://localhost:3001/content',{waitUntil:'domcontentloaded',timeout:90000});await page.getByRole('heading',{name:'Footer / Social Media'}).waitFor();await page.getByRole('switch').first().waitFor({timeout:25000});assert.equal(await page.getByRole('switch').count(),6);await page.screenshot({path:'docs/qa-social-editor.png',fullPage:true});console.log('PASS six standard social editor cards rendered')
 width=check(await db.from('print_settings').select('receipt_width_mm').eq('business_id',businessId).single(),'Original print width').receipt_width_mm
 check(await db.from('print_settings').update({receipt_width_mm:58}).eq('business_id',businessId),'Set QA 58mm')
 await page.goto('http://localhost:3001/orders?status=CANCELLED',{waitUntil:'domcontentloaded',timeout:90000});await page.evaluate(()=>{window.__qaPrintCalls=0;window.print=()=>window.__qaPrintCalls++})
 await page.locator('tr').filter({hasText:'IP-20260908-000004'}).getByRole('button',{name:'Print Receipt'}).click();await page.waitForFunction(()=>window.__qaPrintCalls>0,{timeout:15000})
 assert.ok(await page.locator('.receipt-58').count());await page.emulateMedia({media:'print'});await page.screenshot({path:'docs/qa-receipt-guest-58.png',fullPage:true});console.log('PASS actual guest order 58mm receipt and intercepted print invocation; physical printing not tested')
}catch(error){failed=true;console.error('FAIL final verification: '+error.message)}
finally{
 if(socialId)await db.from('social_links').delete().eq('id',socialId)
 if(width!=null&&businessId)await db.from('print_settings').update({receipt_width_mm:width}).eq('business_id',businessId)
 if(userId)await db.auth.admin.deleteUser(userId)
 await browser.close();console.log('Temporary verification account/social fixture removed; original print width restored.')
}
if(failed)process.exitCode=1
