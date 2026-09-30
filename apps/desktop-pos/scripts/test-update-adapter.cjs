const {test}=require('node:test');const assert=require('node:assert/strict');const {EventEmitter}=require('node:events');
const {createUpdateAdapter}=require('../electron/update-adapter.cjs');
test('unconfigured update never invokes a provider',async()=>{
 const adapter=createUpdateAdapter({configured:false});assert.equal((await adapter.run('install')).status,'NOT_CONFIGURED');
});
test('signed-driver lifecycle requires explicit download and fresh idle safety',async()=>{
 const driver=new EventEmitter();let installed=0,now=10000;
 driver.checkForUpdates=async()=>driver.emit('update-available',{version:'0.2.0'});
 driver.downloadUpdate=async()=>driver.emit('update-downloaded',{version:'0.2.0'});
 driver.quitAndInstall=(silent,run)=>{assert.equal(silent,false);assert.equal(run,true);installed++};
 const adapter=createUpdateAdapter({driver,configured:true,now:()=>now});
 assert.equal(driver.autoDownload,false);assert.equal(driver.autoInstallOnAppQuit,false);assert.equal(driver.allowDowngrade,false);
 assert.equal((await adapter.run('install')).status,'BLOCKED');
 assert.equal((await adapter.run('check')).status,'AVAILABLE');assert.equal(installed,0);
 assert.equal((await adapter.run('download')).status,'READY');assert.equal((await adapter.run('install')).status,'BLOCKED');
 adapter.setSafety(true);now+=6000;assert.equal((await adapter.run('install')).status,'BLOCKED');
 adapter.setSafety(false);assert.equal((await adapter.run('install')).status,'BLOCKED');
 adapter.setSafety(true);assert.equal((await adapter.run('install')).status,'INSTALLING');assert.equal(installed,1);
 assert.equal((await adapter.run('install')).status,'BUSY');assert.equal(installed,1);
 assert.equal(adapter.status().status,'INSTALLING');
});
test('native installer launch failure is recoverable and redacted',async()=>{
 const driver=new EventEmitter();driver.checkForUpdates=async()=>driver.emit('update-available',{version:'0.2.0'});
 driver.downloadUpdate=async()=>driver.emit('update-downloaded',{version:'0.2.0'});
 driver.quitAndInstall=()=>{throw Error('private native path')};
 const adapter=createUpdateAdapter({driver,configured:true});await adapter.run('check');await adapter.run('download');adapter.setSafety(true);
 const result=await adapter.run('install');assert.equal(result.status,'FAILED');assert.ok(!result.message.includes('private'));
 assert.equal((await adapter.run('install')).status,'BLOCKED');assert.equal((await adapter.run('check')).status,'AVAILABLE');
});
test('signature/download rejection never installs or reveals provider details',async()=>{
 const driver=new EventEmitter();driver.checkForUpdates=async()=>driver.emit('update-available',{version:'0.2.0'});
 driver.downloadUpdate=async()=>{throw Error('private provider credential')};driver.quitAndInstall=()=>{throw Error('must not install')};
 const adapter=createUpdateAdapter({driver,configured:true});await adapter.run('check');const result=await adapter.run('download');
 assert.equal(result.status,'FAILED');assert.ok(!result.message.includes('credential'));adapter.setSafety(true);assert.equal((await adapter.run('install')).status,'BLOCKED');
});
