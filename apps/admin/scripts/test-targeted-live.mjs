// Real-service QA using disposable, preverified test accounts. No emails or orders are sent/created.
// Requires an Admin production server at the explicitly supplied loopback origin.
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { randomUUID } from 'node:crypto'
import { createClient } from '@supabase/supabase-js'
import { createServerClient } from '@supabase/ssr'

const origin=process.argv[2]??'http://localhost:3101'
assert.equal(new URL(origin).hostname,'localhost','QA HTTP target must be loopback')
const env=Object.fromEntries(readFileSync(new URL('../.env.local',import.meta.url),'utf8').split(/\r?\n/).filter(l=>/^[A-Z_]+=/.test(l)).map(l=>{const i=l.indexOf('=');return[l.slice(0,i),l.slice(i+1).trim().replace(/^["']|["']$/g,'')]}))
const admin=createClient(env.NEXT_PUBLIC_SUPABASE_URL,env.SUPABASE_SERVICE_ROLE_KEY,{auth:{persistSession:false,autoRefreshToken:false}})
const users=[],products=[],objects=[]
let stage='Setup';let failed=false
async function check(result,label) { if(result.error)console.error(`Check failed: ${label} (code ${result.error.code??result.error.status??'unknown'}; ${label==='Create temporary QA account' ? result.error.message : 'details omitted'})`);assert.ok(!result.error,label);return result.data }
async function account(business,branch,role,permissions) {
  const email=`qa-upgrade-${randomUUID()}@example.com`,password=`Qa!${randomUUID()}`
  const created=await check(await admin.auth.admin.createUser({email,password,email_confirm:true,user_metadata:{full_name:'Temporary upgrade QA'}}),'Create temporary QA account')
  users.push(created.user.id)
  const membership=await check(await admin.from('staff_memberships').insert({business_id:business,branch_id:branch,user_id:created.user.id,role,is_active:true,permissions_customized:true}).select('id').single(),'Create temporary scoped membership')
  await check(await admin.from('staff_membership_permissions').insert(permissions.map(permission_code=>({membership_id:membership.id,permission_code}))),'Assign exact temporary permissions')
  const jar=new Map()
  const client=createServerClient(env.NEXT_PUBLIC_SUPABASE_URL,env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY,{cookieOptions:{name:'italian-pizza-admin-auth',path:'/',sameSite:'lax'},cookies:{getAll:()=>[...jar].map(([name,value])=>({name,value})),setAll:updates=>updates.forEach(({name,value})=>jar.set(name,value))}})
  await check(await client.auth.signInWithPassword({email,password}),'Sign in temporary QA account')
  return {client,membership:membership.id,email,cookie:()=>[...jar].map(([k,v])=>`${k}=${v}`).join('; ')}
}
async function route(person,path,allowed) {
  const response=await fetch(new URL(path,origin),{headers:person?{Cookie:person.cookie()}:{},redirect:'manual',signal:AbortSignal.timeout(45000)})
  const body=await response.text()
  const softRedirect=body.includes('NEXT_REDIRECT')||body.includes('__next-page-redirect')
  const matches=allowed?response.status===200&&!softRedirect:(response.status>=300&&response.status<400)||softRedirect
  if(!matches)console.error(`Route check: ${path}, HTTP ${response.status}, expected ${allowed?'allowed':'denied'}, paymentPage=${body.includes('Payment center')}, menuPage=${body.includes('Menu & products')}, nextRedirect=${body.includes('NEXT_REDIRECT')||body.includes('__next-page-redirect')}, locationHeader=${Boolean(response.headers.get('location'))}`)
  assert.ok(matches,`${path} ${allowed?'allowed':'denied'} HTTP guard`)
}
const png=Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+jRz0AAAAASUVORK5CYII=','base64')
try {
  const business=await check(await admin.from('businesses').select('id').eq('slug','italian-pizza').single(),'Resolve intended business')
  const branch=await check(await admin.from('branches').select('id').eq('business_id',business.id).eq('is_active',true).order('sort_order').limit(1).single(),'Resolve intended restaurant')
  stage='Products-only exact access'
  const editor=await account(business.id,branch.id,'MANAGER',['products.manage'])
  assert.deepEqual(await check(await editor.client.rpc('effective_permissions',{p_business_id:business.id}),'Read effective permissions'),['products.manage'],'Database returns only explicitly assigned permission')
  await route(editor,'/menu',true)
  for(const path of ['/payments','/users','/settings','/categories','/invoices'])await route(editor,path,false)
  const escalation=await fetch(new URL('/api/staff',origin),{method:'POST',headers:{Cookie:editor.cookie(),Origin:origin,'Content-Type':'application/json'},body:JSON.stringify({email:editor.email,role:'OWNER',active:true,permissions:[]})})
  assert.equal(escalation.status,403,'Staff API escalation denied')
  const invoiceAccess=await editor.client.rpc('invoice_list',{p_business_id:business.id})
  assert.ok(invoiceAccess.error,'Invoice RPC denied')
  console.log('PASS: Products-only manager reaches Products; Payments, Categories, Staff, Settings, Invoices and staff escalation denied')
  stage='Restricted cashier access'
  const cashier=await account(business.id,branch.id,'CASHIER',['pos.use','orders.read','receipts.print'])
  for(const path of ['/pos','/orders','/receipts'])await route(cashier,path,true)
  for(const path of ['/menu','/payments','/reports','/users','/register'])await route(cashier,path,false)
  console.log('PASS: exact cashier HTTP routes; denied menu/payments/reports/staff/full register')
  stage='Authenticated Storage RLS and upload'
  const path=`${business.id}/qa-upgrade/${randomUUID()}.png`
  objects.push({bucket:'business-logos',path})
  const deniedUpload=await editor.client.storage.from('business-logos').upload(path,png,{contentType:'image/png'})
  assert.ok(deniedUpload.error,'Products-only user cannot upload branding')
  objects.push({bucket:'product-images',path})
  await check(await editor.client.storage.from('product-images').upload(path,png,{contentType:'image/png'}),'Authenticated product image upload')
  const publicUrl=editor.client.storage.from('product-images').getPublicUrl(path).data.publicUrl
  const image=await fetch(publicUrl);assert.equal(image.status,200);assert.equal((await image.arrayBuffer()).byteLength,png.length)
  const existing=await check(await admin.from('products').select('category_id').eq('business_id',business.id).eq('is_active',true).limit(1).single(),'Resolve product category')
  const product=await check(await editor.client.from('products').insert({business_id:business.id,category_id:existing.category_id,name:'Temporary media QA — inactive',slug:`qa-upgrade-${randomUUID()}`,base_price:0,is_active:false,is_available:false}).select('id').single(),'Create invisible QA product')
  products.push(product.id)
  await check(await editor.client.from('product_images').insert({product_id:product.id,url:publicUrl,alt_text:'Temporary media QA',is_primary:true,sort_order:1}),'Persist uploaded URL in authoritative gallery field')
  const gallery=await check(await editor.client.from('product_images').select('url').eq('product_id',product.id).single(),'Read persisted media URL')
  assert.equal(gallery.url,publicUrl)
  const anonymous=createClient(env.NEXT_PUBLIC_SUPABASE_URL,env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY,{auth:{persistSession:false,autoRefreshToken:false}})
  const hidden=await check(await anonymous.from('products').select('id').eq('id',product.id),'Verify QA product not public')
  assert.equal(hidden.length,0,'QA content must never appear in customer ordering')
  const deniedProduct=await cashier.client.from('products').update({base_price:1}).eq('id',product.id).select('id')
  assert.ok(deniedProduct.error||(deniedProduct.data??[]).length===0,'Cashier product mutation denied')
  console.log('PASS: real authenticated product upload/public image retrieval/DB URL persistence; branding and cashier catalog writes denied; QA product hidden')
  stage='Permission update and other upload buckets'
  const more=['categories.manage','banners.manage','branding.manage','printing.manage','deals.manage']
  await check(await admin.from('staff_membership_permissions').insert(more.map(permission_code=>({membership_id:editor.membership,permission_code}))),'Update exact QA grants')
  await route(editor,'/categories',true)
  for(const bucket of ['category-images','hero-banners','business-logos']) {
    const objectPath=`${business.id}/qa-upgrade/${randomUUID()}.png`;objects.push({bucket,path:objectPath})
    await check(await editor.client.storage.from(bucket).upload(objectPath,png,{contentType:'image/png'}),`${bucket} upload`)
    const response=await fetch(editor.client.storage.from(bucket).getPublicUrl(objectPath).data.publicUrl);assert.equal(response.status,200);await response.body?.cancel()
  }
  console.log('PASS: category/banner/logo uploads and public retrieval; updated exact permissions take effect without signing in again')
  stage='Anonymous route denial'
  await route(null,'/invoices',false);await route(null,'/users',false)
  console.log('PASS: anonymous protected routes redirect to sign-in')
} catch { failed=true;console.error(`FAIL at ${stage}. Provider payloads and credentials intentionally omitted.`) }
finally {
  for(const {bucket,path} of objects) { const result=await admin.storage.from(bucket).remove([path]);if(result.error){failed=true;console.error(`Cleanup failed for QA media in ${bucket}`)} }
  for(const id of products) { const result=await admin.from('products').delete().eq('id',id);if(result.error){failed=true;console.error(`Cleanup failed for QA product ${id}`)} }
  for(const id of users) { const result=await admin.auth.admin.deleteUser(id);if(result.error){failed=true;console.error(`Cleanup failed for QA account ${id}`)} }
  console.log('QA cleanup attempted for all recorded temporary accounts, products and Storage objects. Immutable audit history is retained.')
}
if(failed)process.exitCode=1
