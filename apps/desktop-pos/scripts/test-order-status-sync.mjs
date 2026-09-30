import {createServer} from 'node:http';import {build} from 'esbuild';import {chromium} from 'playwright/test';import {fileURLToPath} from 'node:url';
const bundle=await build({stdin:{contents:`import {db} from './src/db';import {reconcileOrderStatuses} from './src/order-status-sync';window.api={db,reconcileOrderStatuses};`,resolveDir:fileURLToPath(new URL('../',import.meta.url))},bundle:true,write:false,platform:'browser',format:'iife',tsconfigRaw:{compilerOptions:{target:'ES2022'}}});
const server=createServer((req,res)=>{res.setHeader('Content-Type',req.url==='/app.js'?'application/javascript':'text/html');res.end(req.url==='/app.js'?bundle.outputFiles[0].text:'<script src="/app.js"></script>')});
await new Promise(resolve=>server.listen(0,'127.0.0.1',resolve));const browser=await chromium.launch({channel:'chrome'});
try{
 const page=await browser.newPage();await page.goto(`http://127.0.0.1:${server.address().port}`);
 const checks=await page.evaluate(async()=>{
  const {db,reconcileOrderStatuses}=window.api,passed=[];
  const check=(value,name)=>{if(!value)throw Error(name);passed.push(name)};
  await db.orders.bulkPut([{id:'local',branchId:'a',syncState:'SYNCED',serverOrderId:'cloud',operationalStatus:'CONFIRMED',total:100},{id:'pending',branchId:'a',syncState:'PENDING',serverOrderId:'pending-cloud',operationalStatus:'CANCELLED'},{id:'foreign',branchId:'b',syncState:'SYNCED',serverOrderId:'foreign-cloud'}]);
  let requests=0;
  await reconcileOrderStatuses('a',async ids=>{requests++;check(ids.length===1&&ids[0]==='cloud','only acknowledged orders in selected branch fetched');return [{id:'cloud',status:'READY'},{id:'foreign-cloud',status:'CANCELLED'},{id:'pending-cloud',status:'CONFIRMED'}]});
  check((await db.orders.get('local')).operationalStatus==='READY'&&(await db.orders.get('local')).total===100,'kitchen status updates without changing accounting');
  check(!(await db.orders.get('foreign')).operationalStatus&&(await db.orders.get('pending')).operationalStatus==='CANCELLED','foreign rows and pending local actions cannot be overwritten');
  let release,started;const ready=new Promise(resolve=>started=resolve),wait=new Promise(resolve=>release=resolve);
  const work=reconcileOrderStatuses('a',async()=>{requests++;started();await wait;return [{id:'cloud',status:'DELIVERED'}]});await ready;
  const concurrent=reconcileOrderStatuses('a',async()=>{throw Error('duplicate request')});
  await db.orders.update('local',{syncState:'PENDING',operationalStatus:'CANCELLED',revision:2});release();await Promise.all([work,concurrent]);
  check(requests===2&&(await db.orders.get('local')).operationalStatus==='CANCELLED','concurrent refresh deduplicates and late response preserves new mutation');
  await db.orders.update('local',{syncState:'SYNCED'});
  await reconcileOrderStatuses('a',async()=>[{id:'cloud',status:'UNKNOWN'}]);
  check((await db.orders.get('local')).operationalStatus==='CANCELLED','unknown server status fails closed');
  db.close();await db.open();check((await db.orders.get('local')).operationalStatus==='CANCELLED','reconciled state persists across database restart');
  return passed;
 });checks.forEach(name=>console.log('PASS '+name));console.log(`${checks.length} passed / 0 failed`);
}finally{await browser.close();await new Promise(resolve=>server.close(resolve))}
