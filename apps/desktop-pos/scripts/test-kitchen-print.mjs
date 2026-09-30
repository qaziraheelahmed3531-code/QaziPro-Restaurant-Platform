import {createServer} from 'node:http';import {build} from 'esbuild';import {chromium} from 'playwright/test';import {fileURLToPath} from 'node:url';
const bundle=await build({stdin:{contents:`import {db} from './src/db';import {prepareKitchenJob,dispatchKitchenJob,copyKitchenJob} from './src/kitchen-print';window.api={db,prepareKitchenJob,dispatchKitchenJob,copyKitchenJob};`,resolveDir:fileURLToPath(new URL('../',import.meta.url))},bundle:true,write:false,platform:'browser',format:'iife',tsconfigRaw:{compilerOptions:{target:'ES2022'}}});
const server=createServer((req,res)=>{res.setHeader('Content-Type',req.url==='/app.js'?'application/javascript':'text/html');res.end(req.url==='/app.js'?bundle.outputFiles[0].text:'<script src="/app.js"></script>')});
await new Promise(resolve=>server.listen(0,'127.0.0.1',resolve));const browser=await chromium.launch({channel:'chrome'});
try{
 const page=await browser.newPage();await page.goto(`http://127.0.0.1:${server.address().port}`);
 const checks=await page.evaluate(async()=>{
  const {db,prepareKitchenJob,dispatchKitchenJob,copyKitchenJob}=window.api,passed=[];const check=(value,name)=>{if(!value)throw Error(name);passed.push(name)};
  const catalog={branchId:'a',branchName:'Counter A',receiptSettings:{width:58}},order={id:'sale',branchId:'a',localNumber:'OFF-1',tokenNumber:1,orderType:'DINE_IN',tableReference:'T2',notes:'No chilli',items:[{name:'Pizza',quantity:1,variantName:'Large',selections:[{groupName:'Cheese',optionName:'Extra'}]}]};
  let denied=false;try{await prepareKitchenJob(catalog,order)}catch{denied=true}check(denied,'unconfigured printer cannot claim dispatch');
  await db.settings.put({key:'kitchen-printer:a',value:'kitchen'});
  const [job,replay]=await Promise.all([prepareKitchenJob(catalog,order),prepareKitchenJob(catalog,order)]);
  check(job.id===replay.id&&await db.printJobs.count()===1,'rapid ticket preparation creates one durable identity');
  check(job.ticket.width===58&&job.ticket.lines[0].details.join(' ').includes('Extra')&&job.ticket.reference.includes('T2'),'snapshot ticket retains modifiers, variant, table and paper width');
  let started,release,calls=0;const ready=new Promise(r=>started=r),wait=new Promise(r=>release=r);
  const sending=dispatchKitchenJob('a',job.id,async()=>{calls++;started();await wait;return {status:'SUBMITTED',message:'driver'}});await ready;
  await dispatchKitchenJob('a',job.id,async()=>{calls++;return {status:'SUBMITTED'}});release();await sending;
  check(calls===1&&(await db.printJobs.get(job.id)).state==='SUBMITTED','durable claim prevents double native kitchen dispatch');
  denied=false;try{await dispatchKitchenJob('other',job.id,async()=>{calls++})}catch{denied=true}check(denied&&calls===1,'foreign branch cannot dispatch another kitchen ticket');
  await db.settings.put({key:'kitchen-printer:a',value:'fallback-printer'});
  const copy=await copyKitchenJob('a',job.id);check(copy.id!==job.id&&copy.ticket.title.startsWith('COPY')&&copy.deviceName==='fallback-printer'&&(await db.printJobs.get(job.id)).deviceName==='kitchen'&&(await db.printJobs.get(job.id)).state==='SUBMITTED','explicit copy uses selected fallback, separate identity and preserves original audit');
  await dispatchKitchenJob('a',copy.id,async()=>{throw Error('response lost')});check((await db.printJobs.get(copy.id)).state==='UNKNOWN','lost native response is uncertain, not success');
  await db.printJobs.update(copy.id,{state:'PRINTING'});db.close();await db.open();
  await dispatchKitchenJob('a',copy.id,async()=>{calls++});check(calls===1&&(await db.printJobs.get(copy.id)).state==='PRINTING','process-interrupted print never automatically retries after reopen');
  return passed;
 });checks.forEach(name=>console.log('PASS '+name));console.log(`${checks.length} passed / 0 failed`);
}finally{await browser.close();await new Promise(resolve=>server.close(resolve))}
