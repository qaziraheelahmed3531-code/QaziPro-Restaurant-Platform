import assert from 'node:assert/strict';
import { mkdtemp, readFile, readdir, rm, mkdir, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { _electron as electron, expect } from 'playwright/test';
import { build } from 'esbuild';
const root=resolve(fileURLToPath(new URL('../',import.meta.url)));
const profile=await mkdtemp(join(tmpdir(),'qazipro-native-test-'));
const env={...process.env};delete env.ELECTRON_RUN_AS_NODE;delete env.ELECTRON_RENDERER_URL;
let app;
try{
 const started=Date.now();const metrics={};
 const packaged=process.argv.includes('--packaged');
 app=await electron.launch({executablePath:packaged?join(root,'release-staging/win-unpacked/QaziPRO POS Desktop.exe'):fileURLToPath(new URL('../../../node_modules/electron/dist/electron.exe',import.meta.url)),args:[...(packaged?[]:[root]),`--user-data-dir=${profile}`,'--desktop-smoke'],env,timeout:30000});
 assert.equal(resolve(await app.evaluate(({app})=>app.getPath('userData'))),resolve(profile),'must never use the real operator profile');
 const page=await app.firstWindow();const errors=[];page.on('pageerror',error=>errors.push(error.message));
 try{await expect(page.getByRole('button',{name:/Google/})).toBeVisible({timeout:10000})}
 catch(error){console.log(JSON.stringify({url:page.url(),body:await page.locator('body').innerText(),errors}));throw error}
 const meta=await page.evaluate(()=>window.desktopPOS.meta());assert.equal(meta.platform,'win32');console.log('PASS real Electron shell and sender-validated bridge');
 // Native accelerator handlers receive Electron input, not CDP's renderer-only
 // keyboard dispatch. Exercise the same path as a physical desktop keyboard.
 await app.evaluate(({BrowserWindow})=>BrowserWindow.getAllWindows()[0].webContents.sendInputEvent({type:'keyDown',keyCode:'F11'}));
 await expect.poll(()=>app.evaluate(({BrowserWindow})=>BrowserWindow.getAllWindows()[0].isFullScreen())).toBe(true);
 await app.evaluate(({BrowserWindow})=>BrowserWindow.getAllWindows()[0].webContents.sendInputEvent({type:'keyDown',keyCode:'Escape'}));
 await expect.poll(()=>app.evaluate(({BrowserWindow})=>BrowserWindow.getAllWindows()[0].isFullScreen())).toBe(false);
 metrics.coldLoginMs=Date.now()-started;
 await page.context().addInitScript(()=>{
   window.nativePerf={longTasks:[],interactions:[]};
   new PerformanceObserver(list=>list.getEntries().forEach(e=>window.nativePerf.longTasks.push(Math.round(e.duration)))).observe({type:'longtask',buffered:true});
 });
 const secret='fixture-only-'+crypto.randomUUID();
 await page.evaluate(async secret=>{await window.desktopCredentials.set('sb-native-test',secret);if(await window.desktopCredentials.get('sb-native-test')!==secret)throw Error('credential mismatch')},secret);
 const files=await readdir(join(profile,'credentials'));assert.equal(files.length,1);
 assert.ok(!(await readFile(join(profile,'credentials',files[0]))).includes(Buffer.from(secret)));console.log('PASS actual Windows safeStorage encryption round trip; plaintext absent from disk');
 await page.evaluate(()=>window.desktopCredentials.remove('sb-native-test'));
 const before=await app.evaluate(({BrowserWindow})=>BrowserWindow.getAllWindows().map(w=>w.id));
 await page.evaluate(async()=>{
  window.nativeTestSentinel='cart-survives';const canvas=document.createElement('canvas');canvas.width=canvas.height=16;canvas.getContext('2d').fillRect(0,0,16,16);
  if(!await window.desktopPOS.setBranding(canvas.toDataURL(),'Fixture restaurant','fixture-native-business'))throw Error('branding failed');
 });
 await expect.poll(()=>app.evaluate(({BrowserWindow})=>BrowserWindow.getAllWindows()[0].getTitle())).toContain('Fixture restaurant');
 assert.deepEqual(await app.evaluate(({BrowserWindow})=>BrowserWindow.getAllWindows().map(w=>w.id)),before);
 assert.equal(await page.evaluate(()=>window.nativeTestSentinel),'cart-survives');console.log('PASS branding changes in place without cart/session remount');
 const printers=await page.evaluate(()=>window.desktopPrinters());assert.ok(Array.isArray(printers));console.log(`PASS native printer enumeration (${printers.length} installed; no physical job sent)`);
 const bad=await app.evaluate(async({ipcMain})=>{try{await ipcMain._invokeHandlers.get('desktop:meta')({sender:{},senderFrame:{url:'https://untrusted.invalid'}});return false}catch{return true}});assert.equal(bad,true);console.log('PASS untrusted IPC sender rejected');
 const popup=await page.evaluate(()=>window.open('https://example.invalid')===null);assert.equal(popup,true);console.log('PASS unexpected window denied');
 assert.equal(await page.evaluate(()=>window.desktopPOS.openOAuth('https://evil.invalid/desktop-pos-auth').then(()=>false,()=>true)),true);
 console.log('PASS OAuth native bridge rejects non-canonical host');
 assert.deepEqual(errors,[]);console.log('PASS no native renderer runtime errors');
 const seed=await build({stdin:{contents:`import {db} from './src/db';window.fixtureDB=db;`,resolveDir:root},bundle:true,write:false,platform:'browser',format:'iife',tsconfigRaw:{compilerOptions:{target:'ES2022'}}});
 await page.evaluate(seed.outputFiles[0].text);
 await page.evaluate(async()=>{
   await window.fixtureDB.catalogs.put({branchId:'native-branch',businessId:'native-business',catalogVersionId:'fixture-version',branchName:'Offline counter',businessName:'Native Fixture',city:'Fixture',logoUrl:null,logoDataUrl:null,faviconUrl:null,faviconDataUrl:null,primaryColor:'#a92114',secondaryColor:'#e7a81a',replacementWindowMinutes:10,recentOrderLimit:10,desktopOrderSound:false,paymentMethods:[{id:'cash',code:'CASH',name:'Cash',kind:'CASH',requiresReference:false,sortOrder:0},{id:'card',code:'CARD',name:'Terminal',kind:'CARD',requiresReference:true,sortOrder:1}],categories:[{id:'food',name:'Food'}],products:[{id:'pizza',categoryId:'food',name:'Offline Pizza',sku:'P1',price:1000,imageUrl:null,imageDataUrl:null,groups:[],variants:[]}],deals:[],updatedAt:new Date().toISOString()});
   await window.fixtureDB.shifts.put({id:'native-shift',branchId:'native-branch',openingCash:0,openedAt:new Date().toISOString(),closedAt:null,countedCash:null,status:'OPEN',syncedAt:null});
   await window.desktopCredentials.set('sb-desktop-offline-access',JSON.stringify({userId:'native-staff',branches:[{id:'native-branch',business_id:'native-business'}],verifiedAt:Date.now(),expiresAt:Date.now()+3600000}));
   await window.fixtureDB.settings.put({key:'locked',value:'false'});
   const expires=Math.floor(Date.now()/1000)+3600;
   const token=btoa(JSON.stringify({alg:'none'}))+'.'+btoa(JSON.stringify({sub:'native-staff',exp:expires}))+'.fixture';
   await window.desktopCredentials.set('sb-jzisqjvroxodvmqxzsob-auth-token',JSON.stringify({access_token:token,refresh_token:'fixture-not-valid-online',expires_at:expires,expires_in:3600,token_type:'bearer',user:{id:'native-staff',aud:'authenticated',email:'native@example.test'}}));
 });
 const cdp=await page.context().newCDPSession(page);
 await cdp.send('Network.enable');
 await cdp.send('Network.emulateNetworkConditions',{offline:true,latency:0,downloadThroughput:0,uploadThroughput:0});
 await cdp.send('Network.overrideNetworkState',{offline:true,latency:0,downloadThroughput:0,uploadThroughput:0});
 const warmStarted=Date.now();await page.reload();
 // Electron's navigator.onLine follows OS adapter state, not DevTools network
 // emulation. Assert actual transport failure and the application's outage UX.
 assert.equal(await page.evaluate(()=>fetch('https://example.com').then(()=>false,()=>true)),true,'actual network request must fail');
 const product=page.getByRole('button',{name:/Offline Pizza/});
 try{await expect(product).toBeVisible({timeout:30000})}catch(error){console.log(JSON.stringify({body:await page.locator('body').innerText(),errors}));throw error}
 metrics.cachedMenuMs=Date.now()-warmStarted;
 await product.evaluate(async button=>{const started=performance.now();button.click();await new Promise(resolve=>requestAnimationFrame(()=>requestAnimationFrame(resolve)));window.nativePerf.interactions.push(performance.now()-started)});
 await product.click();
 metrics.addToPaintMs=await page.evaluate(()=>window.nativePerf.interactions[0]);
 await page.evaluate(seed.outputFiles[0].text);
 await expect.poll(()=>page.evaluate(async()=>(await window.fixtureDB.drafts.toArray())[0]?.items.length)).toBe(2);
 await page.reload();await expect(page.locator('.cart-lines')).toContainText('Offline Pizza');
 console.log('PASS actual network disconnected: cashier can add items and recover cart after renderer restart');
 const checkout=page.getByRole('button',{name:/Checkout/});await checkout.click();
 await expect(page.getByRole('button',{name:/Terminal CARD/})).toBeDisabled();
 console.log('PASS offline terminal payment disabled');
 await page.getByRole('button',{name:'Exact cash',exact:true}).click();
 // Stub only the physical print boundary. Local database and native bridge remain real.
 await app.evaluate(({ipcMain})=>{ipcMain.removeHandler('desktop:print-receipt');ipcMain.handle('desktop:print-receipt',()=>({status:'CANCELLED',message:'Fixture print dialog cancelled; no physical job sent.'}))});
 await page.getByRole('button',{name:'Place order & print receipt',exact:true}).evaluate(button=>{button.click();button.click()});
 await expect(page.getByRole('heading',{name:'Receipt ready'})).toBeVisible();
 await page.evaluate(seed.outputFiles[0].text);
 const offlineOrders=await page.evaluate(()=>window.fixtureDB.orders.toArray());assert.equal(offlineOrders.length,1);assert.equal(offlineOrders[0].total,2000);assert.equal(offlineOrders[0].syncState,'PENDING');
 console.log('PASS actual offline double submit creates one durable cash sale, no fake cloud confirmation');
 await page.reload();await page.evaluate(seed.outputFiles[0].text);assert.equal(await page.evaluate(()=>window.fixtureDB.orders.count()),1);
 await expect(page.locator('.cart-lines')).not.toContainText('Offline Pizza');console.log('PASS restart after commit retains sale and does not resurrect paid cart');
 for(const [width,height] of [[1024,768],[1366,768],[1440,900],[1920,1080]]){
   await app.evaluate(({BrowserWindow},{width,height})=>{const window=BrowserWindow.getAllWindows()[0];window.unmaximize();window.setContentSize(width,height)},{width,height});
   await expect.poll(()=>page.evaluate(()=>innerWidth)).toBe(width);
   await expect.poll(()=>page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth+1)).toBe(true);
   await expect.poll(()=>page.locator('.cart').evaluate(el=>{const r=el.getBoundingClientRect();return r.width>0&&r.left>=0&&r.right<=innerWidth+1})).toBe(true);
 }
 console.log('PASS native 1024/1366/1440/1920 display widths');
 metrics.lastNavigationLongTasks=await page.evaluate(()=>window.nativePerf.longTasks);
 metrics.heapUsedBytes=await page.evaluate(()=>performance.memory?.usedJSHeapSize??null);
 await mkdir(new URL('../../../test-results/desktop',import.meta.url),{recursive:true});
 await page.screenshot({path:fileURLToPath(new URL('../../../test-results/desktop/native-counter.png',import.meta.url))});
 await writeFile(new URL(`../../../test-results/desktop/${packaged?'packaged':'native'}-evidence.json`,import.meta.url),JSON.stringify({recordedAt:new Date().toISOString(),packaged,metrics,errors,passed:13,failed:0},null,2));
 console.log(JSON.stringify({nativePerformance:metrics}));
 console.log('13 passed, 0 failed; cash UI tested offline; physical printer/provider and server delivery NOT tested');
}finally{await app?.close();assert.ok(resolve(profile).startsWith(resolve(tmpdir()))&&profile.includes('qazipro-native-test-'));await rm(profile,{recursive:true,force:true,maxRetries:5,retryDelay:200})}
