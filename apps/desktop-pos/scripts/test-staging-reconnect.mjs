// Real Electron → real staging Supabase. No mail, provider charge or paper job.
import assert from 'node:assert/strict';
import {randomUUID} from 'node:crypto';
import {readFile,mkdtemp,rm} from 'node:fs/promises';
import {tmpdir} from 'node:os';import {join,resolve} from 'node:path';import {fileURLToPath} from 'node:url';import {parseEnv} from 'node:util';
import {createClient} from '@supabase/supabase-js';import {_electron as electron,expect} from 'playwright/test';import {build} from 'esbuild';
const env=parseEnv(await readFile(new URL('../../admin/.env.local',import.meta.url),'utf8'));
assert.equal(env.NEXT_PUBLIC_SUPABASE_URL,'https://jzisqjvroxodvmqxzsob.supabase.co');
const runtime=JSON.parse(await readFile(new URL('../dist/desktop-runtime.json',import.meta.url),'utf8'));
assert.equal(runtime.adminUrl,'https://admin.staging.qazipro.com','Build the staging renderer first');
const service=createClient(env.NEXT_PUBLIC_SUPABASE_URL,env.SUPABASE_SERVICE_ROLE_KEY,{auth:{persistSession:false,autoRefreshToken:false}});
const checked=(result,label)=>{if(result.error)throw Error(`${label}: ${result.error.message}`);return result.data};
const business=randomUUID(),branch=randomUUID(),product=randomUUID(),category=randomUUID(),slug='qa-desktop-'+randomUUID().slice(0,8);
const profile=await mkdtemp(join(tmpdir(),'qazipro-native-test-live-'));const root=resolve(fileURLToPath(new URL('../',import.meta.url)));
let user,app,created=false,page;let passed=0;const pass=name=>{passed++;console.log('PASS '+name)};
try{
 checked(await service.from('businesses').insert({id:business,name:'Desktop reconnect fixture',slug,city:'Fixture',is_active:true}),'fixture business');created=true;
 checked(await service.from('service_entitlements').insert(['admin.restaurant','pos.desktop','pos.web','website.ordering','ordering.pickup','ordering.delivery','inventory','kitchen'].map(capability_key=>({business_id:business,capability_key,source:'OVERRIDE',enabled:true}))),'fixture entitlements');
 checked(await service.from('branches').insert({id:branch,business_id:business,name:'Reconnect counter',code:'RC',city:'Fixture',address:'Fixture'}),'fixture branch');
 checked(await service.from('business_branding').upsert({business_id:business,display_name:'Desktop reconnect fixture'}),'fixture branding');
 checked(await service.from('business_operating_settings').upsert({business_id:business,tax_rate_bps:1000}),'fixture tax');
 checked(await service.from('categories').insert({id:category,business_id:business,name:'Fixture food',slug:'fixture-food'}),'fixture category');
 checked(await service.from('products').insert({id:product,business_id:business,category_id:category,name:'Reconnect Pizza',slug:'reconnect-pizza',base_price:1000,is_active:true,is_available:true}),'fixture product');
 const email=slug+'@example.test',password=randomUUID()+randomUUID();user=checked(await service.auth.admin.createUser({email,password,email_confirm:true}),'fixture identity').user.id;
 checked(await service.from('staff_memberships').insert({business_id:business,branch_id:branch,user_id:user,role:'OWNER',is_active:true}),'fixture membership');
 const staff=createClient(env.NEXT_PUBLIC_SUPABASE_URL,env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY,{auth:{persistSession:false,autoRefreshToken:false}});
 const session=checked(await staff.auth.signInWithPassword({email,password}),'fixture sign in').session;
 const childEnv={...process.env};delete childEnv.ELECTRON_RUN_AS_NODE;delete childEnv.ELECTRON_RENDERER_URL;
 app=await electron.launch({executablePath:fileURLToPath(new URL('../../../node_modules/electron/dist/electron.exe',import.meta.url)),args:[root,`--user-data-dir=${profile}`,'--desktop-smoke'],env:childEnv});page=await app.firstWindow();
 assert.equal(resolve(await app.evaluate(({app})=>app.getPath('userData'))),resolve(profile));
 const seed=await build({stdin:{contents:`import {db} from './src/db';window.fixtureDB=db;`,resolveDir:root},bundle:true,write:false,format:'iife',platform:'browser',tsconfigRaw:{compilerOptions:{target:'ES2022'}}});
 await page.evaluate(seed.outputFiles[0].text);
 await page.evaluate(async session=>{await window.desktopCredentials.set('sb-jzisqjvroxodvmqxzsob-auth-token',JSON.stringify(session));await window.fixtureDB.settings.put({key:'locked',value:'false'})},session);
 await page.reload();await expect(page.getByRole('button',{name:/Reconnect counter/})).toBeVisible({timeout:45000});await page.getByRole('button',{name:/Reconnect counter/}).click();
 await expect(page.getByRole('button',{name:'Open shift',exact:true})).toBeVisible({timeout:45000});await page.getByRole('button',{name:'Open shift',exact:true}).click();
 const tile=page.getByRole('button',{name:/Reconnect Pizza/});await expect(tile).toBeVisible({timeout:15000});pass('real staff provisions device and downloads server price/tax snapshot');
 const cdp=await page.context().newCDPSession(page);await cdp.send('Network.enable');await cdp.send('Network.emulateNetworkConditions',{offline:true,latency:0,downloadThroughput:0,uploadThroughput:0});
 assert.equal(await page.evaluate(()=>fetch('https://jzisqjvroxodvmqxzsob.supabase.co/auth/v1/health').then(()=>false,()=>true)),true);
 // Native OS adapter state does not change under CDP; the offline event is
 // additional UI feedback, not a substitute for the failed transport above.
 await page.evaluate(()=>window.dispatchEvent(new Event('offline')));
 await tile.click();await page.getByRole('button',{name:'Checkout',exact:true}).click();await page.getByRole('button',{name:'Exact cash',exact:true}).click();
 await app.evaluate(({ipcMain})=>{ipcMain.removeHandler('desktop:print-receipt');ipcMain.handle('desktop:print-receipt',()=>({status:'CANCELLED',message:'Physical print boundary not exercised.'}))});
 await page.getByRole('button',{name:'Place order & print receipt',exact:true}).evaluate(button=>{button.click();button.click()});await expect(page.getByRole('heading',{name:'Receipt ready'})).toBeVisible();
 await page.evaluate(seed.outputFiles[0].text);const saved=await page.evaluate(()=>window.fixtureDB.orders.toArray());assert.equal(saved.length,1);assert.equal(saved[0].total,1100);assert.equal(saved[0].tax,100);pass('actual offline double submit saves one cash sale including snapshot tax');
 await page.keyboard.press('Escape');
 await page.getByRole('button',{name:'Settings',exact:true}).click();
 await page.getByLabel('Cash movement amount').fill('250');await page.getByLabel('Cash movement reason').fill('Offline float top up');
 await page.getByRole('button',{name:'Paid in',exact:true}).click();
 await expect(page.getByText('Cash movement saved on this device.',{exact:false})).toBeVisible();
 await page.getByLabel('Counted cash',{exact:true}).fill('1350');await page.getByRole('button',{name:'Close local shift',exact:true}).click();
 await expect(page.getByRole('heading',{name:'Open counter shift'})).toBeVisible();
 assert.equal(await page.evaluate(async()=>(await window.fixtureDB.shifts.toArray())[0]?.status),'CLOSED');
 pass('manager saves paid-in and closes cash shift while backend is disconnected');
 const missed=Array.from({length:3},(_,index)=>({id:randomUUID(),business_id:business,branch_id:branch,order_number:`${slug}-WEB-${index}`,channel:'WEBSITE',service_mode:'PICKUP',status:'RECEIVED',customer_name:'Backfill fixture',customer_phone:'0000000000',subtotal:1000,total:1000}));
 checked(await service.from('orders').insert(missed),'cloud orders received while workstation disconnected');
 checked(await service.from('products').update({base_price:2000}).eq('id',product),'server price change');checked(await service.from('business_operating_settings').update({tax_rate_bps:2000}).eq('business_id',business),'server tax change');
 await cdp.send('Network.emulateNetworkConditions',{offline:false,latency:0,downloadThroughput:-1,uploadThroughput:-1});await page.evaluate(()=>window.dispatchEvent(new Event('online')));
 await expect.poll(()=>page.evaluate(async()=> (await window.fixtureDB.orders.toArray())[0]?.syncState),{timeout:60000}).toBe('SYNCED');
 const cloud=checked(await service.from('orders').select('id,total,tax,offline_order_id,branch_id').eq('business_id',business).eq('offline_order_id',saved[0].id),'server orders');assert.equal(cloud.length,1);assert.equal(cloud[0].total,1100);assert.equal(cloud[0].tax,100);assert.equal(cloud[0].offline_order_id,saved[0].id);assert.equal(cloud[0].branch_id,branch);
 const payments=checked(await service.from('payment_transactions').select('amount').eq('business_id',business),'server payment');assert.deepEqual(payments,[{amount:1100}]);pass('reconnect reaches canonical cloud once without repricing collected cash');
 await expect.poll(async()=>checked(await service.from('register_shifts').select('counted_cash').eq('business_id',business).single(),'shift sync').counted_cash,{timeout:45000}).toBe(1350);
 const register=checked(await service.from('register_shifts').select('status,expected_cash,counted_cash,difference').eq('business_id',business).single(),'closed shift');
 assert.deepEqual(register,{status:'CLOSED',expected_cash:1350,counted_cash:1350,difference:0});
 assert.equal(checked(await service.from('cash_movements').select('id').eq('business_id',business),'cash movements').length,1);
 pass('offline close reconciles one cash movement and exact server count/difference');
 await expect.poll(()=>page.evaluate(()=>window.fixtureDB.cloudOrders.count()),{timeout:45000}).toBe(3);
 const backfilled=await page.evaluate(()=>window.fixtureDB.cloudOrders.toArray());assert.deepEqual(backfilled.map(order=>order.id).sort(),missed.map(order=>order.id).sort());
 await page.evaluate(()=>window.dispatchEvent(new Event('online')));
 assert.equal(await page.evaluate(()=>window.fixtureDB.cloudOrders.count()),3);
 pass('real backend orders created during disconnect backfill once through authenticated Desktop API');
 const kitchen=checked(await staff.from('orders').select('id,order_items(id)').eq('business_id',business).eq('branch_id',branch).in('status',['CONFIRMED','PREPARING']),'canonical KDS query');
 assert.ok(kitchen.some(order=>order.id===cloud[0].id&&order.order_items.length===1));
 for(const status of ['PREPARING','READY']){
  checked(await staff.from('orders').update({status}).eq('id',cloud[0].id).eq('branch_id',branch),'canonical KDS status');
  await expect.poll(()=>page.evaluate(async()=>(await window.fixtureDB.orders.toArray())[0]?.operationalStatus),{timeout:15000}).toBe(status);
 }
 assert.equal((await page.evaluate(()=>window.fixtureDB.orders.toArray()))[0].total,1100);
 pass('canonical KDS receives one ticket and realtime preparation/ready feeds back without changing cash total');
 await expect.poll(()=>page.evaluate(async()=> (await window.fixtureDB.catalogs.toArray())[0]?.products[0]?.price),{timeout:30000}).toBe(2000);pass('new server menu refreshes after old snapshot sale reconciliation');
 await page.reload();await page.evaluate(seed.outputFiles[0].text);assert.equal(await page.evaluate(()=>window.fixtureDB.orders.count()),1);pass('native renderer restart retains acknowledged sale');
 checked(await service.from('pos_offline_devices').update({is_active:false}).eq('business_id',business),'deauthorize fixture device');
 await page.evaluate(()=>window.dispatchEvent(new Event('online')));await expect(page.getByRole('button',{name:/Google/})).toBeVisible({timeout:60000});
 assert.equal(await page.evaluate(()=>window.fixtureDB.orders.count()),1);pass('deauthorized device locks new activity without deleting its accounting data');
 console.log(JSON.stringify({passed,failed:0,physicalPrint:'NOT_TESTED'}));
}catch(error){console.error('FAIL '+error.message);if(page)console.log((await page.locator('body').innerText().catch(()=>'' )).slice(0,1600));process.exitCode=1;}
finally{
 await app?.close();
 if(created){
  assert.equal(checked(await service.from('businesses').select('slug').eq('id',business).single(),'cleanup target').slug,slug);
  const invoices=checked(await service.from('invoices').select('id').eq('business_id',business),'fixture invoices');if(invoices.length)checked(await service.from('invoice_lines').delete().in('invoice_id',invoices.map(x=>x.id)),'invoice lines');
  for(const table of ['refunds','payment_events','payment_transactions','invoices','pos_order_replacements','cash_movements','register_shifts','orders','pos_catalog_snapshots','pos_offline_devices','support_tickets','restaurant_subscriptions','restaurant_onboarding'])checked(await service.from(table).delete().eq('business_id',business),'cleanup '+table);
  checked(await service.from('businesses').delete().eq('id',business).eq('slug',slug),'cleanup business');
 }
 if(user)checked(await service.auth.admin.deleteUser(user),'cleanup identity');
 assert.ok(resolve(profile).startsWith(resolve(tmpdir()))&&profile.includes('qazipro-native-test-live-'));await rm(profile,{recursive:true,force:true,maxRetries:5,retryDelay:200});console.log('Disposable staging restaurant and isolated native profile removed.');
}
