import {createServer} from 'node:http';import {build} from 'esbuild';import {chromium} from 'playwright/test';import {fileURLToPath} from 'node:url';
const bundle=await build({stdin:{contents:`import {db,openShift,closeShift,recordLocalCashMovement} from './src/db';import {syncShifts} from './src/shift-sync';window.api={db,openShift,closeShift,recordLocalCashMovement,syncShifts};`,resolveDir:fileURLToPath(new URL('../',import.meta.url))},bundle:true,write:false,platform:'browser',format:'iife',tsconfigRaw:{compilerOptions:{target:'ES2022'}}});
const server=createServer((req,res)=>{res.setHeader('Content-Type',req.url==='/app.js'?'application/javascript':'text/html');res.end(req.url==='/app.js'?bundle.outputFiles[0].text:'<script src="/app.js"></script>')});
await new Promise(resolve=>server.listen(0,'127.0.0.1',resolve));const browser=await chromium.launch({channel:'chrome'});
try{
 const page=await browser.newPage();await page.goto(`http://127.0.0.1:${server.address().port}`);
 const checks=await page.evaluate(async()=>{
  const {db,openShift,closeShift,recordLocalCashMovement,syncShifts}=window.api;const passed=[];
  const check=(value,name)=>{if(!value)throw Error(name);passed.push(name)};
  for(const invalid of [NaN,Infinity,-1,0.5]){
    let rejected=false;try{await openShift('invalid',invalid)}catch{rejected=true}check(rejected,'invalid opening float rejected: '+String(invalid));
  }
  const shift=await openShift('branch',100);let sent=0;
  const send=async row=>{sent++;return {id:'server-shift',revision:row.revision??1,status:row.status}};
  await syncShifts({branchIds:['other'],send});check(sent===0,'foreign branch is never sent');
  await syncShifts({branchIds:['branch'],send});check(sent===1&&(await db.shifts.get(shift.id)).syncedRevision===1,'empty open shift syncs independently of sales');
  await syncShifts({branchIds:['branch'],send});check(sent===1,'acknowledged shift is not repeatedly sent');
  const movement={id:crypto.randomUUID(),type:'CASH_IN',amount:50,reason:'Float top up',createdAt:new Date().toISOString()};
  await Promise.all([recordLocalCashMovement(shift.id,movement),recordLocalCashMovement(shift.id,movement)]);
  check((await db.shifts.get(shift.id)).cashMovements.length===1,'rapid cash movement retry persists once');
  let unblock,started;const ready=new Promise(r=>started=r),wait=new Promise(r=>unblock=r);
  const pending=syncShifts({branchIds:['branch'],send:async row=>{started();await wait;return send(row)}});await ready;
  await closeShift(shift.id,150);unblock();await pending;
  check((await db.shifts.get(shift.id)).syncedRevision===2&&(await db.shifts.get(shift.id)).revision===3,'late open acknowledgement does not swallow local close');
  await db.orders.put({id:'pending-sale',shiftId:shift.id,branchId:'branch',syncState:'PENDING'});const before=sent;
  await syncShifts({branchIds:['branch'],send});check(sent===before,'closing waits until saved sales are acknowledged');
  await db.orders.update('pending-sale',{syncState:'SYNCED'});
  await syncShifts({branchIds:['branch'],send});check((await db.shifts.get(shift.id)).syncedRevision===3,'closed count syncs after sale acknowledgement');
  await closeShift(shift.id,999);check((await db.shifts.get(shift.id)).countedCash===150,'repeated close cannot rewrite counted cash');
  const next=await openShift('branch',0);await syncShifts({branchIds:['branch'],send:async()=>{throw {code:'42501'}}});
  check((await db.shifts.get(next.id)).syncNeedsAttention===true,'permission rejection preserves shift for manager review');
  const deniedBefore=sent;await syncShifts({branchIds:['branch'],send});check(sent===deniedBefore,'permission failures do not retry automatically');
  await syncShifts({branchIds:['branch'],retryAttention:true,send});check((await db.shifts.get(next.id)).syncedRevision===1,'explicit reviewed retry recovers shift');
  db.close();await db.open();check((await db.shifts.get(shift.id)).cashMovements.length===1,'cash movement and count survive database restart');
  return passed;
 });checks.forEach(name=>console.log('PASS '+name));console.log(`${checks.length} passed / 0 failed`);
}finally{await browser.close();await new Promise(resolve=>server.close(resolve))}
