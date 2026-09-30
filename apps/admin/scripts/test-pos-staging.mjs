// Disposable STAGING browser-to-database verification. Credentials stay in memory.
// Admin createUser confirms fixtures without sending email. No auth traces/storage files.
import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import { readFileSync } from 'node:fs';
import { mkdir, writeFile } from 'node:fs/promises';
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
let userId, browser, page, created = false, passed = 0;
const pass = name => { passed++; console.log(`PASS ${name}`); };
const insert = async (name, rows) => checked(await db.from(name).insert(rows),name);
try {
  await insert('businesses',{id:business,slug,name:'Disposable Web POS Acceptance',is_active:true,city:'Islamabad'}); created=true;
  const customerOrigin=`https://${slug}.staging.qazipro.com`;
  await insert('business_domains',{business_id:business,hostname:new URL(customerOrigin).hostname,domain_type:'SUBDOMAIN',is_primary:true,is_active:true,verified_at:new Date().toISOString()});
  await insert('service_entitlements',['admin.restaurant','pos.web','pos.desktop','kitchen','waiter','website.ordering','ordering.delivery','ordering.pickup','inventory'].map(capability_key=>({business_id:business,capability_key,enabled:true,source:'OVERRIDE'})));
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
    window.posPerf={longTasks:[],cls:0,layoutShiftTotal:0,lcp:0,maxEventDuration:0,shifts:[],slowEvents:[]};
    let shiftSessionStart=0,shiftPrevious=0,shiftSessionValue=0;
    new PerformanceObserver(list=>list.getEntries().forEach(e=>window.posPerf.longTasks.push(Math.round(e.duration)))).observe({type:'longtask',buffered:true});
    new PerformanceObserver(list=>list.getEntries().forEach(e=>{if(!e.hadRecentInput){
      if(e.startTime-shiftPrevious<1000&&e.startTime-shiftSessionStart<5000)shiftSessionValue+=e.value;
      else{shiftSessionStart=e.startTime;shiftSessionValue=e.value}
      shiftPrevious=e.startTime;window.posPerf.cls=Math.max(window.posPerf.cls,shiftSessionValue);window.posPerf.layoutShiftTotal+=e.value;
      window.posPerf.shifts.push({at:Math.round(e.startTime),value:e.value,nodes:(e.sources??[]).map(s=>s.node?.className).filter(x=>typeof x==='string')});
    }})).observe({type:'layout-shift',buffered:true});
    new PerformanceObserver(list=>list.getEntries().forEach(e=>window.posPerf.lcp=e.startTime)).observe({type:'largest-contentful-paint',buffered:true});
    if(PerformanceObserver.supportedEntryTypes.includes('event'))new PerformanceObserver(list=>list.getEntries().forEach(e=>{
      window.posPerf.maxEventDuration=Math.max(window.posPerf.maxEventDuration,e.duration);
      if(e.duration>=100)window.posPerf.slowEvents.push({name:e.name,duration:e.duration,inputDelay:Math.round(e.processingStart-e.startTime),handler:Math.round(e.processingEnd-e.processingStart),target:e.target?.getAttribute?.('aria-label')??e.target?.className});
    })).observe({type:'event',buffered:true,durationThreshold:16});
  });
  page=await context.newPage(); const runtimeErrors=[]; page.on('pageerror',e=>runtimeErrors.push(e.message));
  const devtools=await context.newCDPSession(page);
  await devtools.send('Profiler.enable');await devtools.send('Profiler.start');
  page.on('console',message=>{if(message.type()==='error'){
    const text=message.text();
    // Capture exception text only, never request headers, cookie values or args.
    if(/Error|Minified React/.test(text)){
      const safe=text.replace(/https?:\/\/\S+/g,'[url]').slice(0,1200);
      runtimeErrors.push(safe);console.log('BROWSER_ERROR '+safe);
    }
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
  const posReadyMs=Date.now()-started;
  console.log(`POS_READY_MS ${posReadyMs}`);
  await mkdir(new URL('../../../test-results/pos',import.meta.url),{recursive:true});
  await page.screenshot({path:fileURLToPath(new URL('../../../test-results/pos/staging-pos.png',import.meta.url)),fullPage:true});
  pass('authenticated branch-scoped POS bootstrap');
  await tile.click();await tile.click();await tile.click();
  await expect(page.locator('.quantity-row>span')).toHaveText('3');pass('real catalog rapid adds');
  await page.getByRole('button',{name:'Hold',exact:true}).click();
  await expect(page.getByText('Select a product to start a counter order.')).toBeVisible();
  await page.getByRole('button',{name:/Held orders/}).click();
  await page.getByRole('button',{name:/Resume/}).click();
  await expect(page.locator('.quantity-row>span')).toHaveText('3');pass('canonical held order persists and resumes');
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
  await page.locator('.receipt-preview').getByRole('button',{name:/Close/}).click();
  await expect(page.locator('.receipt-preview')).toHaveCount(0);
  const kitchen=await context.newPage();await kitchen.goto(`${origin}/kitchen`,{waitUntil:'domcontentloaded',timeout:90000});
  const ticket=kitchen.locator('.kds-ticket').filter({hasText:order.order_number});await expect(ticket).toBeVisible({timeout:30000});
  await ticket.getByRole('button',{name:'Start preparing'}).click();await ticket.getByRole('button',{name:'Mark ready'}).click();
  await expect.poll(async()=>checked(await db.from('orders').select('status').eq('id',order.id).single(),'KDS state').status,{timeout:45000}).toBe('READY');pass('POS order → KDS → canonical ready status');
  console.log(JSON.stringify({realtimeErrors,connection:await page.locator('.pos-connection').innerText()}));
  await page.bringToFront();
  await expect(page.locator('[data-pos-order-id]').filter({hasText:order.order_number})).toContainText(/ready/i,{timeout:30000});pass('KDS status returns to POS without reload');
  const payload={branchId:branch,shiftId:shift.id,clientReference:randomUUID(),orderType:'TAKEAWAY',cashReceived:5000,paymentMethodCode:'CASH',items:[{productId:product,quantity:1,modifiers:[]}]};
  const concurrentStarted=Date.now();
  const results=await Promise.all([staff.rpc('create_pos_order',{p_payload:payload}),staff.rpc('create_pos_order',{p_payload:payload})]);
  console.log(JSON.stringify({concurrentMs:Date.now()-concurrentStarted,codes:results.map(result=>result.error?.code??'OK')}));
  assert.equal(checked(results[0],'concurrent sale').id,checked(results[1],'concurrent replay').id);pass('concurrent HTTP requests produce same sale');
  const qrTable=checked(await db.from('restaurant_tables').select('public_token').eq('id',table).single(),'QR table');
  const guestContext=await browser.newContext({viewport:{width:1440,height:1000}});
  const guest=await guestContext.newPage();
  await guest.goto(`${customerOrigin}/t/${qrTable.public_token}`,{waitUntil:'domcontentloaded',timeout:90000});
  const guestProduct=guest.getByRole('article').filter({has:guest.getByRole('heading',{name:'Acceptance Margherita',exact:true})});
  await expect(guestProduct).toBeVisible({timeout:45000});
  await guestProduct.getByRole('button',{name:'Add',exact:true}).click();
  // Adding a simple item canonically opens the cart drawer automatically.
  await guest.getByRole('link',{name:'Checkout',exact:true}).click();
  await guest.getByLabel(/Full name/).fill('QR acceptance guest');
  await guest.getByLabel(/Phone/).fill('03001234567');
  await expect(guest.getByText('Dining at Acceptance table.',{exact:false})).toBeVisible();
  await guest.getByRole('button',{name:'Place order',exact:true}).filter({visible:true}).first().click();
  await expect.poll(async()=>checked(await db.from('orders').select('id').eq('business_id',business).eq('channel','WEBSITE'),'QR browser order').length,{timeout:45000}).toBe(1);
  const qrRow=checked(await db.from('orders').select('id,order_number').eq('business_id',business).eq('channel','WEBSITE').single(),'QR browser receipt');
  const qr={id:qrRow.id,orderNumber:qrRow.order_number};
  pass('public QR route → full menu → cart → guest dine-in checkout');
  const liveQueue=page.locator('.waiter-pos-queue').filter({visible:true});
  const bill=liveQueue.locator('article').filter({hasText:qr.orderNumber});
  const tableDisclosure=liveQueue.locator(':scope > summary');
  if(await tableDisclosure.count())await tableDisclosure.click();
  await expect(bill).toBeVisible({timeout:45000});
  await bill.getByRole('button',{name:/ORDER \/ TOKEN/}).click();
  await bill.getByLabel('Cash received').fill('1200');
  await bill.getByRole('button',{name:'Mark paid',exact:true}).click();
  await expect(page.getByText(`${qr.orderNumber} paid.`,{exact:false})).toBeVisible({timeout:30000});
  const qrSaved=checked(await db.from('orders').select('business_id,branch_id,service_mode,payment_status').eq('id',qr.id).single(),'QR paid state');
  assert.deepEqual(qrSaved,{business_id:business,branch_id:branch,service_mode:'DINE_IN',payment_status:'PAID'});
  assert.equal(checked(await db.from('payment_transactions').select('id').eq('order_id',qr.id),'QR ledger').length,1);
  pass('canonical QR order reaches correct POS table and is paid once');
  await page.getByLabel('Customer phone',{exact:true}).fill('03001234567');
  await page.getByRole('button',{name:'Find existing customer',exact:true}).click();
  await page.getByRole('button',{name:/QR acceptance guest/}).click();
  await expect(page.getByLabel('Customer name',{exact:true})).toHaveValue('QR acceptance guest');
  pass('canonical customer lookup attaches QR guest');
  checked(await db.from('products').update({base_price:1200}).eq('id',product),'catalog price');
  await expect(tile).toContainText('1,200',{timeout:45000});
  pass('Admin catalog price reaches POS via realtime');
  checked(await db.from('products').update({is_available:false}).eq('id',product),'availability');
  try { await expect(page.getByRole('button',{name:/Acceptance Margherita.*Out of stock/})).toBeDisabled({timeout:45000}); }
  catch(error){console.log(JSON.stringify({path:new URL(page.url()).pathname,body:(await page.locator('body').innerText({timeout:5000})).slice(-3500),realtimeErrors,runtimeErrors}));throw error;}
  pass('Admin catalog availability reaches POS via realtime');
  const performance=await page.evaluate(()=>{
    const nav=performance.getEntriesByType('navigation')[0];
    return {...window.posPerf,ttfb:Math.round(nav.responseStart),responseEnd:Math.round(nav.responseEnd),domContentLoaded:Math.round(nav.domContentLoadedEventEnd),resources:performance.getEntriesByType('resource').filter(r=>r.startTime<6000).sort((a,b)=>b.duration-a.duration).slice(0,12).map(r=>({path:new URL(r.name).pathname,duration:Math.round(r.duration),start:Math.round(r.startTime),bytes:r.transferSize}))};
  });
  console.log(JSON.stringify({publicPerformance:performance}));
  const {profile}=await devtools.send('Profiler.stop');
  console.log(JSON.stringify({devtoolsCpuTop:profile.nodes.filter(n=>n.hitCount).sort((a,b)=>b.hitCount-a.hitCount).slice(0,8).map(n=>({function:n.callFrame.functionName,hits:n.hitCount,script:n.callFrame.url?.split('?')[0].split('/').pop()}))}));
  for(const width of [768,1024,1280,1366,1440]){
    await page.setViewportSize({width,height:1000});
    // Await real finite transitions; a frame during the shell's grid transition is not its final layout.
    await page.evaluate(async()=>{
      document.documentElement.getBoundingClientRect();
      await Promise.all(document.getAnimations().filter(a=>a.effect?.getComputedTiming().iterations!==Infinity).map(a=>a.finished.catch(()=>{})));
    });
    try { await expect.poll(()=>page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth+1)).toBe(true); }
    catch(error){
      const overflow=await page.evaluate(()=>({width:innerWidth,scrollWidth:document.documentElement.scrollWidth,elements:[...document.querySelectorAll('body *')].filter(el=>{
        if(el.getBoundingClientRect().right<=innerWidth+1)return false;
        for(let parent=el.parentElement;parent&&parent!==document.body;parent=parent.parentElement){if(/auto|scroll|hidden|clip/.test(getComputedStyle(parent).overflowX))return false;}
        return true;
      }).slice(0,30).map(el=>({tag:el.tagName,class:el.className,right:Math.round(el.getBoundingClientRect().right)}))}));
      console.log(JSON.stringify({overflow}));throw error;
    }
    pass(`live responsive ${width}`);
  }
  await context.setOffline(true);await expect(page.getByText(/Offline/).first()).toBeVisible();await context.setOffline(false);pass('offline feedback and reconnect');
  const {data:{session:desktopSession}}=await staff.auth.getSession();
  const desktopHeaders={Authorization:`Bearer ${desktopSession.access_token}`};
  const desktopResponse=await fetch(`${origin}/api/desktop-pos/orders?branch=${branch}&sync=1`,{headers:desktopHeaders});
  assert.equal(desktopResponse.status,200);const desktopPage=await desktopResponse.json();
  assert.ok(desktopPage.orders.length>0&&desktopPage.cursor?.updatedAt&&desktopPage.cursor?.id);
  const checkpoint=new URLSearchParams({branch,sync:'1',after:desktopPage.cursor.updatedAt,afterId:desktopPage.cursor.id});
  const nextDesktop=await fetch(`${origin}/api/desktop-pos/orders?${checkpoint}`,{headers:desktopHeaders});assert.equal(nextDesktop.status,200);
  const nextDesktopPage=await nextDesktop.json();assert.ok(!nextDesktopPage.orders.some(o=>o.id===desktopPage.cursor.id));
  pass('Desktop authenticated order cursor reads QR order and advances without replay');
  const foreignDesktop=await fetch(`${origin}/api/desktop-pos/orders?branch=${randomUUID()}&sync=1`,{headers:desktopHeaders});assert.equal(foreignDesktop.status,403);
  const invalidCursor=await fetch(`${origin}/api/desktop-pos/orders?branch=${branch}&sync=1&after=invalid`,{headers:desktopHeaders});assert.equal(invalidCursor.status,400);
  pass('Desktop foreign branch and malformed cursor denied');
  checked(await db.from('service_entitlements').update({enabled:false}).eq('business_id',business).eq('capability_key','pos.web'),'disable fixture POS');
  await expect(page.getByRole('heading',{name:'Web POS is unavailable'})).toBeVisible({timeout:75000});pass('Super Admin entitlement revocation denies open POS without manual reload');
  assert.deepEqual(runtimeErrors,[]);pass('no browser runtime errors');
  const evidence={passed,failed:0,origin,recordedAt:new Date().toISOString(),posReadyMs,performance};
  await writeFile(new URL('../../../test-results/pos/public-evidence.json',import.meta.url),JSON.stringify(evidence,null,2));
  console.log(JSON.stringify(evidence));
} catch(error) {
  if(page){await mkdir(new URL('../../../test-results/pos',import.meta.url),{recursive:true});await page.screenshot({path:fileURLToPath(new URL('../../../test-results/pos/staging-failure.png',import.meta.url)),fullPage:true}).catch(()=>{});}
  console.error(`FAIL ${error.message}`);process.exitCode=1;
}
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
