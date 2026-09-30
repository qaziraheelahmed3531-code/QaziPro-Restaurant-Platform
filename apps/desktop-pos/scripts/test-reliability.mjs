// Real IndexedDB transactions in Chromium; transport is deliberately injected.
// This is not evidence of physical printing, acquiring or live server acceptance.
import assert from 'node:assert/strict';
import { createServer } from 'node:http';
import { build } from 'esbuild';
import { chromium } from 'playwright/test';
const root=new URL('../',import.meta.url).pathname.replace(/^\/([A-Za-z]:)/,'$1');
const result=await build({stdin:{contents:`import {db,commitSale,deviceId,openShift} from './src/db';import {drainOutbox,syncFailure} from './src/outbox';import {authStorage} from './src/auth-storage';import {permitsOffline,readOfflineAccess} from './src/offline-access';import {backfillCloudOrders,cachedCloudOrders} from './src/cloud-orders';window.test={db,commitSale,deviceId,openShift,drainOutbox,syncFailure,authStorage,permitsOffline,readOfflineAccess,backfillCloudOrders,cachedCloudOrders};`,resolveDir:decodeURIComponent(root)},bundle:true,write:false,platform:'browser',format:'iife',tsconfigRaw:{compilerOptions:{target:'ES2022'}}});
const server=createServer((req,res)=>{res.setHeader('Content-Type',req.url==='/test.js'?'text/javascript':'text/html');res.end(req.url==='/test.js'?result.outputFiles[0].text:'<!doctype html><script src="/test.js"></script>')});
await new Promise(resolve=>server.listen(0,'127.0.0.1',resolve));
const browser=await chromium.launch({channel:'chrome',headless:true});
try{
 const page=await browser.newPage();await page.goto(`http://127.0.0.1:${server.address().port}`);
 const passed=await page.evaluate(async()=>{
  const {db,commitSale,deviceId,openShift,drainOutbox,authStorage,permitsOffline,readOfflineAccess,backfillCloudOrders,cachedCloudOrders}=window.test;
  const passed=[];const check=(value,name)=>{if(!value)throw Error(name);passed.push(name)};
  const fixture=(id,branchId='a',extra={})=>({id,branchId,businessDate:'2026-09-30',soldAt:'2026-09-30T10:00:00Z',syncState:'PENDING',operationalStatus:'CONFIRMED',items:[],...extra});
  // Upgrade an actual previous persisted IndexedDB schema, not a fresh v5 DB.
  await db.delete();
  await new Promise((resolve,reject)=>{
    const request=indexedDB.open(db.name,20); // Dexie schema 2 uses native version 20.
    request.onupgradeneeded=()=>{
      const schemas={catalogs:['branchId','updatedAt'],orders:['id','branchId','shiftId','businessDate','soldAt','syncState','serverOrderId','operationalStatus','paymentMethodCode'],shifts:['id','branchId','status','openedAt'],held:['id','createdAt'],settings:['key']};
      for(const [name,[key,...indexes]] of Object.entries(schemas)){
        const store=request.result.createObjectStore(name,{keyPath:key});
        for(const index of indexes)store.createIndex(index,index);
      }
      request.transaction.objectStore('orders').put(fixture('pre-upgrade-sale'));
      request.transaction.objectStore('held').put({id:'pre-upgrade-hold',items:[]});
      request.transaction.objectStore('settings').put({key:'deviceId',value:'pre-upgrade-device'});
    };
    request.onsuccess=()=>{request.result.close();resolve()};request.onerror=()=>reject(request.error);
  });
  await db.open();
  check(db.verno===5&&(await db.orders.get('pre-upgrade-sale')).syncState==='PENDING'&&Boolean(await db.held.get('pre-upgrade-hold'))&&(await deviceId())==='pre-upgrade-device','v2 to v5 migration preserves unsynced sale, held order and device identity');
  await db.orders.clear();
  await Promise.all(Array.from({length:30},(_,i)=>commitSale(fixture('sale-'+i))));
  const sales=await db.orders.toArray();check(new Set(sales.map(s=>s.tokenNumber)).size===30,'30 concurrent sales allocate unique atomic tokens');
  await Promise.all([commitSale(fixture('same')),commitSale(fixture('same'))]);check(await db.orders.count()===31,'same intent replay inserts one local sale');
  db.close();await db.open();check(await db.orders.count()===31,'committed sales survive database close/reopen');
  await db.orders.clear();
  await db.orders.bulkAdd([fixture('crashed','a',{syncState:'SYNCING'}),fixture('foreign','b')]);
  let calls=0;let release;const blocked=new Promise(resolve=>release=resolve);
  const send=async(order)=>{calls++;await blocked;return {id:'server-'+order.id,orderNumber:'POS-1'}};
  const first=drainOutbox({branchIds:['a'],send});
  while(!(await db.orders.get('crashed')).syncStartedAt)await new Promise(resolve=>setTimeout(resolve,0));
  await drainOutbox({branchIds:['a'],send});release();await first;
  check(calls===1,'crash recovery + concurrent workers send once under durable lease');
  check((await db.orders.get('foreign')).syncState==='PENDING','another branch is never uploaded');
  check((await db.orders.get('crashed')).serverOrderId==='server-crashed','original local ID maps to acknowledged server order');
  await db.orders.clear();await db.orders.add(fixture('network'));
  let now=Date.now();let attempts=0;
  const broken=async()=>{attempts++;throw new TypeError('private backend detail')};
  await drainOutbox({branchIds:['a'],send:broken,now:()=>now});
  const failed=await db.orders.get('network');check(failed.syncState==='FAILED'&&!failed.syncError.includes('private'),'thrown network failure is durable and sanitized');
  await drainOutbox({branchIds:['a'],send:broken,now:()=>now});check(attempts===1,'backoff prevents immediate retry storm');
  now+=6000;await drainOutbox({branchIds:['a'],send:async()=>({id:'server',orderNumber:'POS-2'}),now:()=>now});
  check((await db.orders.get('network')).syncState==='SYNCED','transient failure automatically recovers after backoff');
  await db.orders.clear();await db.orders.add(fixture('denied'));
  attempts=0;const denied=async()=>{attempts++;throw {code:'42501',message:'SQL detail'}};
  await drainOutbox({branchIds:['a'],send:denied});await drainOutbox({branchIds:['a'],send:denied});
  check(attempts===1&&(await db.orders.get('denied')).syncNeedsAttention,'authorization failure requires explicit review, no automatic loop');
  await drainOutbox({branchIds:['a'],retryAttention:true,send:async()=>({id:'server',orderNumber:'POS-3'})});
  check((await db.orders.get('denied')).syncState==='SYNCED','explicit retry can recover reviewed failure');
  await db.orders.clear();await db.orders.add(fixture('uncertain'));
  await drainOutbox({branchIds:['a'],send:async()=>null});check((await db.orders.get('uncertain')).syncState==='FAILED','missing acknowledgement never becomes synced');
  await db.orders.clear();await db.orders.add(fixture('changing'));
  await drainOutbox({branchIds:['a'],send:async()=>{await db.orders.update('changing',{revision:1,operationalStatus:'READY',syncState:'PENDING'});return {id:'server',orderNumber:'POS-4',status:'CONFIRMED'}}});
  const changing=await db.orders.get('changing');check(changing.syncState==='PENDING'&&changing.operationalStatus==='READY','late acknowledgement cannot overwrite newer local operation');
  await db.held.bulkAdd([{id:'legacy',createdAt:'1'},{id:'a-hold',branchId:'a',createdAt:'2'},{id:'b-hold',branchId:'b',createdAt:'3'}]);
  check((await db.held.where('branchId').equals('a').toArray()).length===1,'legacy and foreign held carts excluded from branch view');
  const saved=new Map();window.desktopCredentials={get:async key=>saved.get(key)??null,set:async(key,value)=>saved.set(key,value),remove:async key=>saved.delete(key)};
  localStorage.setItem('sb-test-auth-token','token');check(await authStorage.getItem('sb-test-auth-token')==='token'&&!localStorage.getItem('sb-test-auth-token')&&saved.get('sb-test-auth-token')==='token','legacy auth migrates without retaining plaintext');
  await authStorage.removeItem('sb-test-auth-token');check(!saved.size,'signout clears protected credential');
  window.desktopCredentials.set=async()=>{throw Error('OS locked')};localStorage.setItem('sb-test-auth-token','retain-until-safe');
  try{await authStorage.getItem('sb-test-auth-token')}catch{}
  check(localStorage.getItem('sb-test-auth-token')==='retain-until-safe','failed migration never destroys the only credential copy');
  const devices=await Promise.all(Array.from({length:20},()=>deviceId()));check(new Set(devices).size===1,'concurrent device provisioning preserves one identity');
  const shifts=await Promise.all(Array.from({length:20},()=>openShift('a',100)));check(new Set(shifts.map(s=>s.id)).size===1,'rapid shift open creates one shift');
  await db.drafts.put({key:'draft-a',branchId:'a',userId:'staff',intentId:'draft-sale'});
  await db.held.put({id:'hold-a',branchId:'a',userId:'staff'});
  await commitSale(fixture('draft-sale'),'draft-a','hold-a');
  check(!await db.drafts.get('draft-a')&&!await db.held.get('hold-a')&&await db.orders.get('draft-sale'),'sale commit atomically consumes its draft and resumed hold');
  const lease={userId:'staff',branches:[{id:'a',business_id:'business'}],verifiedAt:100000,expiresAt:200000};
  check(permitsOffline(lease,'a','business',150000)&&!permitsOffline(lease,'b','business',150000)&&!permitsOffline(lease,'a','other',150000),'offline grant binds business and branch');
  check(!permitsOffline(lease,'a','business',200000)&&!permitsOffline(lease,'a','business',0),'expiry and clock rollback fail closed');
  check(!permitsOffline({...lease,branches:[null]},'a','business',150000),'malformed offline grant cannot authorize');
  saved.set('sb-desktop-offline-access',JSON.stringify({...lease,expiresAt:lease.verifiedAt+86400001}));check(await readOfflineAccess()===null,'overlong protected grant is rejected');
  const cloud=(id,status='RECEIVED')=>({id,status,created_at:'2026-09-30T00:00:00Z',updated_at:'2026-09-30T00:00:01.123456+00:00'});
  let pages=0;
  const fetchPage=async cursor=>{pages++;const rows=cursor?[cloud('last')]:Array.from({length:200},(_,i)=>cloud('cloud-'+i));return {orders:rows,cursor:{id:rows.at(-1).id,updatedAt:rows.at(-1).updated_at},hasMore:!cursor}};
  const [cloudA,cloudB]=await Promise.all([backfillCloudOrders('a',fetchPage),backfillCloudOrders('a',fetchPage)]);
  check(pages===2&&cloudA.length===201&&cloudB.length===201,'concurrent refresh shares durable multi-page backfill beyond 60 orders');
  db.close();await db.open();check((await cachedCloudOrders('a')).length===201&&(await cachedCloudOrders('b')).length===0,'cloud order cache survives restart and isolates branch');
  const beforeCursor=(await db.settings.get('cloud-orders:a:cursor')).value;
  try{await backfillCloudOrders('a',async()=>{throw Error('disconnected')})}catch{}
  check((await db.settings.get('cloud-orders:a:cursor')).value===beforeCursor,'failed backfill never advances checkpoint');
  await backfillCloudOrders('a',async()=>({orders:[cloud('last','READY')],cursor:{id:'last',updatedAt:'2026-09-30T00:00:02Z'},hasMore:false}));
  check((await db.cloudOrders.get('last')).status==='READY'&&(await cachedCloudOrders('a')).length===201,'replayed cloud order updates status without duplicate ingestion');
  return passed;
 });
 passed.forEach(name=>console.log('PASS '+name));assert.equal(passed.length,29);console.log(`${passed.length} passed, 0 failed`);
}finally{await browser.close();await new Promise(resolve=>server.close(resolve))}
