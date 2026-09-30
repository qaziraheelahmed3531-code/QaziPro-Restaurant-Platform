const {test}=require('node:test')
const assert=require('node:assert/strict')
const fs=require('node:fs/promises')
const os=require('node:os')
const path=require('node:path')
const {createSecureStore}=require('../electron/secure-store.cjs')
test('protected store validates keys, serializes writes, atomically replaces and removes',async()=>{
 const dir=await fs.mkdtemp(path.join(os.tmpdir(),'qazipro-store-test-'))
 const encryption={isEncryptionAvailable:()=>true,encryptString:value=>Buffer.from('encrypted:'+Buffer.from(value).toString('base64')),decryptString:value=>Buffer.from(value.toString().slice(10),'base64').toString()}
 try{
  const store=createSecureStore(dir,encryption)
  assert.equal(await store.get('sb-test-auth-token'),null)
  await Promise.all([store.set('sb-test-auth-token','first-secret'),store.set('sb-test-auth-token','second-secret')])
  assert.equal(await store.get('sb-test-auth-token'),'second-secret')
  const files=await fs.readdir(dir);assert.equal(files.length,1)
  assert.ok(!(await fs.readFile(path.join(dir,files[0]),'utf8')).includes('second-secret'))
  await assert.rejects(store.set('../escape','x'),/Invalid/)
  await assert.rejects(store.set('sb-test-auth-token','x'.repeat(140000)),/Invalid/)
  await store.remove('sb-test-auth-token');assert.equal(await store.get('sb-test-auth-token'),null)
  encryption.isEncryptionAvailable=()=>false
  await assert.rejects(store.set('sb-test-auth-token','x'),/unavailable/)
  encryption.isEncryptionAvailable=()=>true;encryption.getSelectedStorageBackend=()=> 'basic_text'
  await assert.rejects(store.set('sb-test-auth-token','x'),/unavailable/)
 }finally{await fs.rm(dir,{recursive:true,force:true})}
})
