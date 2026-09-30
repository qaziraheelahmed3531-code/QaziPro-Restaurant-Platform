// Isolated real React/Chromium acceptance; mocked transport is not live payment evidence.
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { createServer } from 'node:http';
import { createRequire } from 'node:module';
import { dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { build } from 'esbuild';
import { chromium, expect } from 'playwright/test';
const root=fileURLToPath(new URL('../',import.meta.url)),require=createRequire(new URL('../package.json',import.meta.url));
const fixture={id:'bill',order_number:'QR-42',token_number:42,table_reference:'Table 12',waiter_name:null,customer_name:'Guest',order_notes:null,total:1100,status:'READY',payment_status:'UNPAID',created_at:new Date().toISOString(),order_items:[]};
const mock=`export function createClient(){return {
channel(){const c={on(_event,_filter,callback){window.emitTableChange=callback;return c},subscribe(callback){callback('SUBSCRIBED');return c}};return c},removeChannel(){},
from(){const q={select(){return q},eq(){return q},neq(){return q},order(){return q},abortSignal(){return q},then(done){return Promise.resolve({data:window.tableRows,error:null}).then(done)}};return q},
rpc(name,args){window.requests.push({name,args});const q={abortSignal(){return q},then(done){return new Promise(resolve=>window.finish=resolve).then(done)}};return q}
}}`;
const bundle=await build({tsconfig:root+'tsconfig.json',alias:{react:dirname(require.resolve('react')),'react-dom':dirname(require.resolve('react-dom'))},stdin:{resolveDir:root,loader:'tsx',contents:`import React from 'react';import {createRoot} from 'react-dom/client';import {WaiterPosQueue} from './components/waiter-pos-queue';window.tableRows=[];window.requests=[];createRoot(document.getElementById('root')).render(<><WaiterPosQueue businessId="business-a" branchId="branch-a" shift={{id:'shift-a'}} initialOrders={[]}/><h1>Point of sale</h1></>);`},bundle:true,write:false,platform:'browser',format:'iife',jsx:'automatic',plugins:[{name:'fixture',setup(b){b.onResolve({filter:/^@\/lib\/supabase\/client$/},()=>({path:'mock',namespace:'fixture'}));b.onLoad({filter:/.*/,namespace:'fixture'},()=>({contents:mock}));}}]});
const css=(await Promise.all(['globals.css','(dashboard)/pos/pos.css'].map(path=>readFile(new URL('../app/'+path,import.meta.url),'utf8')))).join('\n').replace(/@import[^;]+;/g,'');
const server=createServer((_req,res)=>{res.setHeader('Content-Type','text/html');res.end(`<html><head><style>${css}</style></head><body><main id="root"></main><script>${bundle.outputFiles[0].text}</script></body></html>`)});
await new Promise(resolve=>server.listen(0,'127.0.0.1',resolve));
const browser=await chromium.launch({channel:'chrome',headless:true});
try{
  const page=await browser.newPage({viewport:{width:1280,height:900}}),errors=[];
  page.on('pageerror',error=>errors.push(error.message));
  await page.goto(`http://127.0.0.1:${server.address().port}`);
  await expect(page.getByText('0 awaiting payment')).toBeVisible();
  const heading=page.getByRole('heading',{name:'Point of sale'});
  const before=(await heading.boundingBox()).y;
  await page.evaluate(row=>{window.tableRows=[row];window.emitTableChange()},fixture);
  await expect(page.getByText('1 awaiting payment')).toBeVisible();
  assert.equal((await heading.boundingBox()).y,before);
  await expect(page.getByText('QR-42',{exact:false})).not.toBeVisible();
  console.log('PASS incoming QR bill keeps cashier layout stable');
  const summary=page.locator('summary');await summary.focus();await page.keyboard.press('Enter');
  await page.getByRole('button',{name:/ORDER \/ TOKEN/}).click();
  await page.getByLabel('Cash received').fill('1200');
  await page.getByRole('button',{name:'Mark paid'}).evaluate(button=>{button.click();button.click()});
  await expect(page.getByRole('button',{name:/Saving/})).toBeDisabled();
  assert.equal(await page.evaluate(()=>window.requests.length),1);
  await page.evaluate(()=>window.finish({data:{change:100},error:null}));
  await expect(page.getByRole('status')).toContainText('QR-42 paid.');
  await expect(page.getByText('0 awaiting payment')).toBeVisible();
  console.log('PASS keyboard disclosure and duplicate-click payment guard');
  await summary.focus();await page.keyboard.press('Enter');assert.equal((await heading.boundingBox()).y,before);
  assert.deepEqual(errors,[]);console.log('PASS closing table panel restores stable layout; no runtime errors');
  console.log(JSON.stringify({passed:3,failed:0,kind:'isolated table queue'}));
}finally{await browser.close();server.close()}
