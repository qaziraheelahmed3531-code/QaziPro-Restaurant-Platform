// Disposable STAGING browser-to-database verification. Credentials stay in memory.
// Admin createUser confirms fixtures without sending email. No auth traces/storage files.
import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import { readFileSync } from 'node:fs';
import { mkdir } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import { parseEnv } from 'node:util';
import { createClient } from '@supabase/supabase-js';
import { createServerClient } from '@supabase/ssr';
import { chromium, expect } from 'playwright/test';

const env = parseEnv(readFileSync(new URL('../.env.local', import.meta.url), 'utf8'));
assert.equal(env.NEXT_PUBLIC_SUPABASE_URL, 'https://jzisqjvroxodvmqxzsob.supabase.co');
const origin = process.argv[2] ?? 'http://localhost:3001';
assert.ok(['http://localhost:3001', 'https://admin.staging.qazipro.com'].includes(origin));
const fixtureFetch = async (url, options = {}) => {
  const headers=new Headers(options.headers);headers.set('Connection','close');
  try { return await fetch(url,{...options,signal:options.signal??AbortSignal.timeout(20000),headers}); }
  catch(error) { console.error(`STAGING_NETWORK_FAILURE ${error.cause?.code??error.name}`);throw error; }
};
const db = createClient(env.NEXT_PUBLIC_SUPABASE_URL, env.SUPABASE_SERVICE_ROLE_KEY, {global:{fetch:fixtureFetch},auth:{persistSession:false,autoRefreshToken:false}});
const checked = (result,label) => { if(result.error) throw Error(`${label}: ${result.error.message}`); return result.data; };
const safeRetry = async (operation,label) => {
  let result;
  for(let attempt=0;attempt<3;attempt++){
    result=await operation();
    if(!result.error || !/fetch failed|timeout|network/i.test(result.error.message))break;
  }
  return checked(result,label);
};
const business = randomUUID(), branch = randomUUID(), otherBranch = randomUUID(), product = randomUUID(), table = randomUUID();
const slug = `qa-web-pos-${randomUUID().slice(0,8)}`;
let userId, browser, created = false, passed = 0;
const pass = name => { passed++; console.log(`PASS ${name}`); };
const insert = async (name, rows) => checked(await db.from(name).insert(rows),name);
try {
  await insert('businesses',{id:business,slug,name:'Disposable Web POS Acceptance',is_active:true,city:'Islamabad'}); created=true;
  await insert('service_entitlements',['admin.restaurant','pos.web','kitchen','waiter','website.ordering','ordering.delivery','ordering.pickup','inventory'].map(capability_key=>({business_id:business,capability_key,enabled:true,source:'OVERRIDE'})));
  await insert('branches',[{id:branch,business_id:business,name:'Acceptance counter',code:'QA1',slug:'qa1',address:'Disposable fixture',city:'Islamabad',pickup_enabled:true,delivery_enabled:true},{id:otherBranch,business_id:business,name:'Restricted counter',code:'QA2',slug:'qa2',address:'Disposable fixture',city:'Islamabad',pickup_enabled:true,delivery_enabled:true}]);
  checked(await db.from('business_hours').upsert(Array.from({length:7},(_,day_of_week)=>({branch_id:branch,day_of_week,opens_at:'00:00',closes_at:'23:59:59',is_closed:false})),{onConflict:'branch_id,day_of_week'}),'hours');
  checked(await db.from('business_operating_settings').upsert({business_id:business,tax_rate_bps:1000}),'tax');
  checked(await db.from('print_settings').upsert({business_id:business,auto_print_receipt:false}),'print');
  const category=randomUUID();
  await insert('categories',{id:category,business_id:business,name:'Acceptance menu',slug:'acceptance-menu'});
  await insert('products',{id:product,business_id:business,category_id:category,name:'Acceptance Margherita',slug:'acceptance-margherita',base_price:1000,is_active:true,is_available:true});
  await insert('restaurant_tables',{id:table,business_id:business,branch_id:branch,code:'QA1',name:'Acceptance table'});
  const email=`${slug}@example.test`, password=randomUUID()+randomUUID();
  userId=checked(await db.auth.admin.createUser({email,password,email_confirm:true}), 'fixture identity').user.id;
  await insert('staff_memberships',{business_id:business,branch_id:branch,user_id:userId,role:'OWNER',is_active:true});
  const jar=new Map();
  const staff=createServerClient(env.NEXT_PUBLIC_SUPABASE_URL,env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY,{global:{fetch:fixtureFetch},cookieOptions:{name:'italian-pizza-admin-auth',path:'/',sameSite:'lax'},cookies:{getAll:()=>[...jar].map(([name,value])=>({name,value})),setAll:values=>values.forEach(({name,value})=>jar.set(name,value))}});
  await safeRetry(()=>staff.auth.signInWithPassword({email,password}),'fixture sign-in');
  const access=await safeRetry(()=>staff.rpc('resolve_restaurant_admin_access',{p_business_id:business}),'access');
  assert.equal(access.allowed,true,`Access denied: ${access.reason}`);
  const shift=checked(await staff.rpc('open_pos_shift',{p_branch_id:branch,p_opening_cash:0}),'shift');
  browser=await chromium.launch({channel:'chrome',headless:true});
  const context=await browser.newContext({viewport:{width:1440,height:1000}});
  await context.addCookies([...jar].map(([name,value])=>({name,value,url:origin,sameSite:'Lax'})).concat([{name:'ip-admin-business',value:business,url:origin},{name:'ip-admin-branch',value:branch,url:origin}]));
  await context.addInitScript(()=>{
    window.print=()=>{window.printCalls=(window.printCalls??0)+1};
    window.posPerf={longTasks:[],cls:0,lcp:0};
    new PerformanceObserver(list=>list.getEntries().forEach(e=>window.posPerf.longTasks.push(Math.round(e.duration)))).observe({type:'longtask',buffered:true});
    new PerformanceObserver(list=>list.getEntries().forEach(e=>{if(!e.hadRecentInput)window.posPerf.cls+=e.value})).observe({type:'layout-shift',buffered:true});
    new PerformanceObserver(list=>list.getEntries().forEach(e=>window.posPerf.lcp=e.startTime)).observe({type:'largest-contentful-paint',buffered:true});
  });
  const page=await context.newPage(); const runtimeErrors=[]; page.on('pageerror',e=>runtimeErrors.push(e.message));
  page.on('console',message=>{if(message.type()==='error'){
    const text=message.text();
    // Capture exception text only, never request headers, cookie values or args.
    if(/Error|Minified React/.test(text))console.log('BROWSER_ERROR '+text.replace(/https?:\/\/\S+/g,'[url]').slice(0,1200));
  }});
  const realtimeErrors=[];
  page.on('websocket',socket=>{
    socket.on('socketerror',()=>realtimeErrors.push('WebSocket transport failed'));
    socket.on('framereceived',({payload})=>{try{
      const event=JSON.parse(String(payload));
      if(event.event==='system'&&event.payload?.status==='error') realtimeErrors.push(String(event.payload.message).slice(0,250));
    }catch{/* Never capture tokens or outbound/auth frames. */}});
  });
  const started=Date.now();
  await page.goto(`${origin}/pos`,{waitUntil:'domcontentloaded',timeout:90000});
  const tile=page.getByRole('button',{name:/Acceptance Margherita.*Add to order/});
  await expect(tile).toBeVisible({timeout:45000});
  await mkdir(new URL('../../../test-results/pos',import.meta.url),{recursive:true});
  await page.screenshot({path:fileURLToPath(new URL('../../../test-results/pos/staging-pos.png',import.meta.url)),fullPage:true});
  console.log(`POS_READY_MS ${Date.now()-started}`);pass('authenticated branch-scoped POS bootstrap');
  await tile.click();await tile.click();await tile.click();
  await expect(page.locator('.quantity-row>span')).toHaveText('3');pass('real catalog rapid adds');
  await page.getByRole('button',{name:'Checkout',exact:true}).click();
  const dialog=page.getByRole('dialog');await dialog.getByRole('button',{name:'Exact cash',exact:true}).click();
  const response=page.waitForResponse(r=>r.url().includes('/rpc/create_pos_order'));
  await dialog.getByRole('button',{name:'Complete sale',exact:true}).click();
  assert.equal((await response).status(),200);
  await expect(page.getByText('Receipt ready',{exact:true})).toBeVisible({timeout:30000});
  const orders=checked(await db.from('orders').select('id,order_number,total,payment_status,branch_id,status').eq('business_id',business),'saved sale');
  assert.equal(orders.length,1);const order=orders[0];assert.equal(order.total,3300);assert.equal(order.payment_status,'PAID');assert.equal(order.branch_id,branch);pass('UI cash sale → server tax → one paid order');
  assert.equal(checked(await db.from('payment_transactions').select('id').eq('order_id',order.id),'ledger').length,1);pass('one payment ledger entry');
  await page.getByRole('button',{name:'Print receipt',exact:true}).click();await expect.poll(()=>page.evaluate(()=>window.printCalls??0)).toBe(1);pass('persisted receipt → browser print');
  const kitchen=await context.newPage();await kitchen.goto(`${origin}/kitchen`,{waitUntil:'domcontentloaded',timeout:90000});
  const ticket=kitchen.locator('.kds-ticket').filter({hasText:order.order_number});await expect(ticket).toBeVisible({timeout:30000});
  await ticket.getByRole('button',{name:'Start preparing'}).click();await ticket.getByRole('button',{name:'Mark ready'}).click();
  await expect.poll(async()=>checked(await db.from('orders').select('status').eq('id',order.id).single(),'KDS state').status,{timeout:45000}).toBe('READY');pass('POS order → KDS → canonical ready status');
  console.log(JSON.stringify({realtimeErrors,connection:await page.locator('.pos-connection').innerText()}));
  await page.bringToFront();
  await expect(page.locator('[data-pos-order-id]').filter({hasText:order.order_number})).toContainText(/ready/i,{timeout:30000});pass('KDS status returns to POS without reload');
  const payload={branchId:branch,shiftId:shift.id,clientReference:randomUUID(),orderType:'TAKEAWAY',cashReceived:5000,paymentMethodCode:'CASH',items:[{productId:product,quantity:1,modifiers:[]}]};
  const results=await Promise.all([staff.rpc('create_pos_order',{p_payload:payload}),staff.rpc('create_pos_order',{p_payload:payload})]);
  assert.equal(checked(results[0],'concurrent sale').id,checked(results[1],'concurrent replay').id);pass('concurrent HTTP requests produce same sale');
  checked(await db.from('products').update({is_available:false}).eq('id',product),'availability');
  try { await expect(page.getByRole('button',{name:/Acceptance Margherita.*Out of stock/})).toBeDisabled({timeout:45000}); }
  catch(error){console.log(JSON.stringify({path:new URL(page.url()).pathname,body:(await page.locator('body').innerText({timeout:5000})).slice(-3500),realtimeErrors,runtimeErrors}));throw error;}
  pass('Admin catalog availability reaches POS via realtime');
  for(const width of [768,1024,1280,1366,1440]){await page.setViewportSize({width,height:1000});assert.equal(await page.evaluate(()=>document.documentElement.scrollWidth>innerWidth+1),false);pass(`live responsive ${width}`);}
  await context.setOffline(true);await expect(page.getByText(/Offline/).first()).toBeVisible();await context.setOffline(false);pass('offline feedback and reconnect');
  const performance=await page.evaluate(()=>window.posPerf);
  checked(await db.from('service_entitlements').update({enabled:false}).eq('business_id',business).eq('capability_key','pos.web'),'disable fixture POS');
  await page.reload({waitUntil:'domcontentloaded'});await expect(page.getByRole('heading',{name:'Web POS is unavailable'})).toBeVisible({timeout:30000});pass('Super Admin entitlement gate denies POS');
  assert.deepEqual(runtimeErrors,[]);pass('no browser runtime errors');
  console.log(JSON.stringify({passed,failed:0,origin,performance}));
} catch(error) { console.error(`FAIL ${error.message}`);process.exitCode=1; }
finally {
  await browser?.close();
  if(created){
    assert.ok(slug.startsWith('qa-web-pos-'));
    const exact=await safeRetry(()=>db.from('businesses').select('slug').eq('id',business).single(),'cleanup target');assert.equal(exact.slug,slug);
    const invoices=checked(await db.from('invoices').select('id').eq('business_id',business),'fixture invoices');
    if(invoices.length)checked(await db.from('invoice_lines').delete().in('invoice_id',invoices.map(x=>x.id)),'fixture invoice lines');
    for(const name of ['refunds','payment_events','payment_transactions','invoices','pos_order_replacements','cash_movements','register_shifts','orders','support_tickets','restaurant_subscriptions','restaurant_onboarding']) await safeRetry(()=>db.from(name).delete().eq('business_id',business),`cleanup ${name}`);
    await safeRetry(()=>db.from('businesses').delete().eq('id',business).eq('slug',slug),'fixture restaurant cleanup');
  }
  if(userId)await safeRetry(()=>db.auth.admin.deleteUser(userId),'fixture identity cleanup');
  console.log('Disposable staging fixture removed. No email or external payment was sent.');
}
