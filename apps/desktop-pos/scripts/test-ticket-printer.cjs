const {test}=require('node:test'),assert=require('node:assert/strict')
const {ticketHtml}=require('../electron/ticket-document.cjs')
const {createTicketPrinter}=require('../electron/ticket-printer.cjs')
const ticket={width:58,title:'TEST',branch:'Branch <script>alert(1)</script>',reference:'OFF-1',notes:'& " note',lines:[{quantity:2,name:'Pizza <img src=x>',details:['No onion']}]}
test('ticket document is bounded, escaped, self-contained and respects 58/80mm',()=>{
 const html=ticketHtml(ticket);assert.ok(html.includes('width:52mm'));assert.ok(html.includes('&lt;script&gt;'));assert.ok(!html.includes('<script>'));assert.ok(html.includes("default-src 'none'"));assert.ok(ticketHtml({...ticket,width:80}).includes('width:74mm'))
 for(const invalid of [{...ticket,width:999},{...ticket,lines:[]},{...ticket,lines:[{quantity:-1,name:'Pizza',details:[]}]},{...ticket,notes:'x'.repeat(2001)}])assert.throws(()=>ticketHtml(invalid))
})
test('ticket adapter uses isolated prepared document, selected printer and no automatic repeat',async()=>{
 let destroyed=0,prints=0,done,url,deny
 const printer=createTicketPrinter({createWindow:()=>({isDestroyed:()=>false,destroy:()=>destroyed++,loadURL:async value=>{url=value},webContents:{setWindowOpenHandler:fn=>deny=fn,on:()=>{},isDestroyed:()=>false,getPrintersAsync:async()=>[{name:'kitchen'}],print:(options,callback)=>{assert.equal(options.silent,false);assert.equal(options.deviceName,'kitchen');prints++;done=callback}}})})
 const pending=printer.print({deviceName:'kitchen',ticket});assert.equal((await printer.print({deviceName:'kitchen',ticket})).status,'BUSY')
 while(!done)await new Promise(resolve=>setImmediate(resolve));assert.ok(url.startsWith('data:text/html'));assert.equal(deny().action,'deny');done(true)
 assert.equal((await pending).status,'SUBMITTED');assert.equal(prints,1);assert.equal(destroyed,1)
 assert.equal((await printer.print({deviceName:'missing',ticket})).status,'FAILED');assert.equal(prints,1);assert.equal(destroyed,2)
 assert.equal((await printer.print({deviceName:'kitchen',ticket:{...ticket,width:1}})).status,'FAILED');assert.equal(destroyed,2)
})
test('ticket load failure cleans up native window and does not claim printing',async()=>{
 let destroyed=false
 const printer=createTicketPrinter({createWindow:()=>({isDestroyed:()=>false,destroy:()=>destroyed=true,loadURL:async()=>{throw Error('private')},webContents:{setWindowOpenHandler:()=>{},on:()=>{}}})})
 const result=await printer.print({deviceName:'kitchen',ticket});assert.equal(result.status,'FAILED');assert.ok(!result.message.includes('private'));assert.ok(destroyed)
})
