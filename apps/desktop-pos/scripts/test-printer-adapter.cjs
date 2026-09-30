const {test}=require('node:test')
const assert=require('node:assert/strict')
const {createPrinterAdapter}=require('../electron/printer-adapter.cjs')
test('printer adapter validates target, serializes request and reports only spooler acknowledgement',async()=>{
 let callback,calls=0
 const adapter=createPrinterAdapter({isDestroyed:()=>false,getPrintersAsync:async()=>[{name:'thermal',displayName:'Thermal',isDefault:true,status:0}],print:(options,done)=>{assert.equal(options.silent,false);calls++;callback=done}})
 assert.equal((await adapter.list()).length,1)
 assert.equal((await adapter.print({deviceName:'missing'})).status,'FAILED');assert.equal(calls,0)
 const pending=adapter.print();assert.equal((await adapter.print()).status,'BUSY');callback(true)
 assert.equal((await pending).status,'SUBMITTED');assert.equal(calls,1)
 const cancelled=adapter.print();callback(false,'cancelled');assert.equal((await cancelled).status,'CANCELLED')
 const failed=adapter.print();callback(false,'printer offline');assert.equal((await failed).status,'FAILED');assert.equal(calls,3)
})
test('destroyed renderer and driver exceptions fail without losing sale or retrying',async()=>{
 assert.equal((await createPrinterAdapter({isDestroyed:()=>true}).print()).status,'FAILED')
 assert.equal((await createPrinterAdapter({isDestroyed:()=>false,print:()=>{throw Error('driver')}}).print()).status,'FAILED')
})
