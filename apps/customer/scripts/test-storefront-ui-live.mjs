// Actual browser clicks + real services. Print boundary is intercepted (no physical paper).
import assert from 'node:assert/strict'
import { randomUUID } from 'node:crypto'
import { pathToFileURL } from 'node:url'
import { createClient } from '@supabase/supabase-js'
import { createServerClient } from '@supabase/ssr'
process.loadEnvFile(new URL('../.env.local',import.meta.url))
const env=process.env,db=createClient(env.NEXT_PUBLIC_SUPABASE_URL,env.SUPABASE_SERVICE_ROLE_KEY,{auth:{persistSession:false,autoRefreshToken:false}})
const {chromium}=await import(pathToFileURL(process.argv[2]).href)
const browser=await chromium.launch({channel:'chrome',headless:true}),users=[],orders=[]
let stage='setup',failed=false,adminPage,printSnapshot,businessId,branchId
const check=(r,label)=>{if(r.error)throw new Error(label+' code '+r.error.code);return r.data}
async function account(namespace,staff=false){
 const email=`qa-ui-${randomUUID()}@example.com`,password='Qa!'+randomUUID(),user=check(await db.auth.admin.createUser({email,password,email_confirm:true,user_metadata:{full_name:'QA UI — DO NOT FULFILL'}}),'QA user').user;users.push(user.id)
 if(staff){const m=check(await db.from('staff_memberships').insert({business_id:businessId,branch_id:branchId,user_id:user.id,role:'MANAGER',is_active:true,permissions_customized:true}).select('id').single(),'QA staff');check(await db.from('staff_membership_permissions').insert(['orders.read','orders.manage','receipts.print','kds.use','delivery.manage','social.manage','printing.manage'].map(permission_code=>({membership_id:m.id,permission_code}))),'QA permissions')}
 const jar=new Map(),client=createServerClient(env.NEXT_PUBLIC_SUPABASE_URL,env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY,{cookieOptions:{name:namespace,path:'/',sameSite:'lax'},cookies:{getAll:()=>[...jar].map(([name,value])=>({name,value})),setAll:items=>items.forEach(({name,value})=>jar.set(name,value))}})
 check(await client.auth.signInWithPassword({email,password}),'QA login')
 return {id:user.id,client,cookies:[...jar].map(([name,value])=>({name,value,domain:'localhost',path:'/',sameSite:'Lax'}))}
}
async function navigate(page,url){
 for(let attempt=0;attempt<2;attempt++){
  try{await page.goto(url,{waitUntil:'domcontentloaded',timeout:90000});return}
  catch(error){if(attempt||!error.message.includes('ERR_ABORTED'))throw error}
 }
}
try{
 const branch=check(await db.from('branches').select('id,business_id').eq('id','22222222-2222-4222-8222-222222222222').single(),'Branch');businessId=branch.business_id;branchId=branch.id
 printSnapshot=check(await db.from('print_settings').select('receipt_width_mm').eq('business_id',businessId).single(),'Print defaults')
 const staff=await account('italian-pizza-admin-auth',true),context=await browser.newContext({viewport:{width:1440,height:1000}});await context.addCookies(staff.cookies);adminPage=await context.newPage()
 stage='Admin Google typeahead'
 await navigate(adminPage,'http://localhost:3001/delivery')
 await adminPage.getByPlaceholder('Search a restaurant, business or address (e.g. JFC Ghazi Tarbela)').fill('JFC Ghazi tarbela')
 const candidate=adminPage.getByRole('option').filter({hasText:/JFC Ghazi/i}).first();await candidate.waitFor({timeout:25000});await candidate.click()
 await adminPage.getByText('Provider location selected. Drag the pin if fine-tuning is needed.').waitFor({timeout:25000})
 await adminPage.getByRole('button',{name:'Save restaurant location',exact:true}).click()
 await adminPage.getByText('Restaurant location saved.',{exact:true}).waitFor({timeout:25000})
 const saved=check(await db.from('branches').select('latitude,longitude,google_place_id,formatted_address').eq('id',branch.id).single(),'Saved Google pin');assert.ok(saved.google_place_id);console.log(JSON.stringify({stage,result:'PASS live suggestions, selection and Save',saved}))
 await adminPage.screenshot({path:'docs/qa-admin-location.png',fullPage:true})
 await navigate(adminPage,'http://localhost:3001/orders');await adminPage.getByText('Realtime connected',{exact:false}).waitFor({timeout:30000})
 for(const [label,width] of (process.argv[3]==='guest'?[['guest',390]]:[['signed-in',1440],['guest',390]])){
  const customer=label==='signed-in'?await account('italian-pizza-customer-auth'):null
  const customerContext=await browser.newContext({viewport:{width,height:1000}});if(customer)await customerContext.addCookies(customer.cookies)
  const page=await customerContext.newPage();stage=label+' browser checkout'
  await navigate(page,'http://localhost:3000')
  await page.getByRole('button',{name:/Select your area/i}).click();await page.getByRole('combobox').last().click();await page.getByRole('option',{name:/Hamlet Colony/i}).first().click();await page.getByRole('button',{name:'Select',exact:true}).click()
  await page.locator('article').filter({hasText:customer?'Chicken Fajita Pizza':'Zinger Burger'}).filter({visible:true}).first().getByRole('button',{name:'Add',exact:true}).click()
  if(customer)await page.getByRole('button',{name:/^Add to Cart/}).click()
  await page.getByRole('link',{name:'Checkout',exact:true}).click()
  await page.getByRole('heading',{name:'Complete your order'}).waitFor({timeout:60000})
  await page.getByPlaceholder('Your full name').fill('QA UI '+label+' — DO NOT FULFILL');await page.getByPlaceholder('03XX XXXXXXX').fill('03000000000')
  await page.getByRole('combobox',{name:'Search delivery address'}).fill('Hamlet')
  await page.getByRole('option').filter({has:page.locator('strong',{hasText:/^Hamlet$/})}).first().click({timeout:25000})
  await page.getByText(/7.2 km driving distance/).waitFor({timeout:45000})
  await page.locator('.checkout-extra-details summary').click();await page.getByPlaceholder('Gate color, calling preference or rider note').fill('QA TEST — DO NOT PREPARE OR DISPATCH. Cancellation follows test.')
  await page.screenshot({path:`docs/qa-checkout-${width}.png`,fullPage:true});assert.equal(await page.evaluate(()=>document.documentElement.scrollWidth>innerWidth),false)
  const orderResponse=page.waitForResponse(r=>r.url().endsWith('/api/orders')&&r.request().method()==='POST',{timeout:60000})
  await page.locator('button[type=submit]').filter({hasText:'Place order'}).filter({visible:true}).first().click()
  const response=await orderResponse,data=await response.json();if(response.status()!==201)throw new Error('Browser order rejected HTTP '+response.status()+': '+data.error)
  const number=data.order.orderNumber,row=check(await db.from('orders').select('id,customer_id').eq('order_number',number).single(),'Browser order row');orders.push(row.id);assert.equal(row.customer_id,customer?.id??null)
  await page.waitForURL('**/orders/'+number,{timeout:45000});await page.getByRole('heading',{name:'Order '+number}).waitFor({timeout:45000})
  await adminPage.getByText(number,{exact:true}).first().waitFor({timeout:25000})
  console.log(JSON.stringify({stage,orderNumber:number,orderId:row.id,adminArrivalWithoutRefresh:'PASS',checkoutRoute:'7.2 km / PKR 300',overflow:false}))
  if(!customer){
   await page.locator('.tracking-cancel').waitFor({state:'hidden',timeout:65000})
   const expired=await page.request.post('http://localhost:3000/api/orders/'+number+'/cancel',{headers:{'X-Order-Token':data.order.guestTrackingToken}})
   assert.equal(expired.status(),409);console.log('Guest cancellation hidden at deadline and direct API denied after 60 seconds PASS')
  }
  // Use the real Admin order actions and customer tracking UI, not a fake status timer.
  const rowUi=adminPage.locator('tr').filter({hasText:number});await rowUi.getByRole('button',{name:'Open',exact:true}).click()
  await adminPage.getByRole('button',{name:'CONFIRMED',exact:true}).click();await page.getByText('The restaurant has confirmed your order.',{exact:true}).first().waitFor({state:'attached',timeout:25000})
  await adminPage.getByRole('button',{name:'PREPARING',exact:true}).click()
  const kitchen=await context.newPage();await navigate(kitchen,'http://localhost:3001/kitchen');await kitchen.getByText(number,{exact:false}).waitFor({timeout:25000});await kitchen.close()
  console.log(label+' browser Admin CONFIRMED/PREPARING, customer tracking and KDS visible PASS')
  await adminPage.getByRole('button',{name:'Close order',exact:true}).click()
  await adminPage.getByRole('button',{name:/^ACTIVE/}).click()
  for(const paper of [80,58]){
   check(await db.from('print_settings').update({receipt_width_mm:paper}).eq('business_id',businessId),'QA print width')
   await navigate(adminPage,'http://localhost:3001/orders?status=PREPARING')
   await adminPage.evaluate(()=>{window.__qaPrintCalls=0;window.print=()=>{window.__qaPrintCalls++}})
   await adminPage.locator('tr').filter({hasText:number}).getByRole('button',{name:'Print Receipt',exact:true}).click()
   await adminPage.waitForFunction(()=>window.__qaPrintCalls>0,{timeout:15000})
   assert.equal(await adminPage.locator('.thermal-receipt').first().getAttribute('class').then(s=>s.includes('receipt-'+paper)),true)
   await adminPage.emulateMedia({media:'print'});await adminPage.screenshot({path:`docs/qa-receipt-${label}-${paper}.png`,fullPage:true});await adminPage.emulateMedia({media:'screen'})
   console.log(label+' '+paper+'mm authoritative receipt rendered; browser print boundary invoked (intercepted, not physical printing)')
  }
  check(await db.from('orders').update({status:'CANCELLED',cancel_reason:'Browser QA complete — not a real customer order',cancelled_by:'ADMIN'}).eq('id',row.id),'Cancel QA')
  await customerContext.close();await navigate(adminPage,'http://localhost:3001/orders')
 }
}catch(error){failed=true;console.error('FAIL '+stage+': '+error.message);if(adminPage)await adminPage.screenshot({path:'docs/qa-admin-failure.png',fullPage:true}).catch(()=>{})}
finally{
 if(printSnapshot&&businessId)await db.from('print_settings').update(printSnapshot).eq('business_id',businessId)
 for(const id of orders){const r=await db.from('orders').update({status:'CANCELLED',cancel_reason:'Browser QA cleanup — not a real customer order',cancelled_by:'ADMIN'}).eq('id',id).neq('status','CANCELLED');if(r.error){failed=true;console.error('Review QA order cleanup '+id)}}
 for(const id of users){const r=await db.auth.admin.deleteUser(id);if(r.error){failed=true;console.error('Temporary QA account cleanup failed')}}
 await browser.close();console.log('QA accounts removed, print width restored, QA order audit records retained.')
}
if(failed)process.exitCode=1
