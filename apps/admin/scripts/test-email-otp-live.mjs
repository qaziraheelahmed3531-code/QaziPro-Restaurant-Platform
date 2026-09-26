// Controlled provider integration, not an inbox-delivery or browser UI test.
// Generates OTPs for two disposable accounts without sending email. Never logs tokens.
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { randomUUID, createHash } from 'node:crypto'
import { createClient } from '@supabase/supabase-js'
import { createServerClient } from '@supabase/ssr'
import { EMAIL_OTP_LENGTH } from '../../../packages/shared/src/auth.ts'
const readEnv=path=>Object.fromEntries(readFileSync(new URL(path,import.meta.url),'utf8').split(/\r?\n/).filter(l=>/^[A-Z_]+=/.test(l)).map(l=>{const i=l.indexOf('=');return[l.slice(0,i),l.slice(i+1).trim().replace(/^["']|["']$/g,'')]}))
const env=readEnv('../.env.local'),customerEnv=readEnv('../../customer/.env.local')
assert.equal(env.NEXT_PUBLIC_SUPABASE_URL,customerEnv.NEXT_PUBLIC_SUPABASE_URL,'Both apps must use the same Auth project')
const provider=createClient(env.NEXT_PUBLIC_SUPABASE_URL,env.SUPABASE_SERVICE_ROLE_KEY,{auth:{persistSession:false,autoRefreshToken:false}})
const users=[];let failed=false,stage='setup'
function checked(result,label){if(result.error)throw new Error(`${label}: provider status ${result.error.status??result.error.code??'unknown'}`);return result.data}
async function ownerFingerprint(){const rows=checked(await provider.from('staff_memberships').select('id,business_id,user_id,role,is_active').eq('role','OWNER').eq('is_active',true).order('id'),'Owner read');return createHash('sha256').update(JSON.stringify(rows)).digest('hex')}
const before=await ownerFingerprint()
async function account(staff=false) {
 const email=`qa-otp-${randomUUID()}@example.com`
 const created=checked(await provider.auth.admin.createUser({email,email_confirm:true,user_metadata:{full_name:'Disposable OTP QA'}}),'Create disposable account');users.push(created.user.id)
 let membership
 if(staff){
  const business=checked(await provider.from('businesses').select('id').eq('slug','italian-pizza').single(),'Business lookup')
  const branch=checked(await provider.from('branches').select('id').eq('business_id',business.id).eq('is_active',true).order('sort_order').limit(1).single(),'Restaurant lookup')
  membership=checked(await provider.from('staff_memberships').insert({business_id:business.id,branch_id:branch.id,user_id:created.user.id,role:'STAFF',is_active:true,permissions_customized:true}).select('id').single(),'Temporary membership')
  checked(await provider.from('staff_membership_permissions').insert({membership_id:membership.id,permission_code:'products.manage'}),'Exact permission')
 }
 const generated=checked(await provider.auth.admin.generateLink({type:'magiclink',email}),'Generate disposable OTP')
 const token=generated.properties.email_otp
 assert.equal(token.length,EMAIL_OTP_LENGTH,'Provider OTP length matches shared configuration')
 const jar=new Map()
 const options={cookieOptions:{name:staff?'italian-pizza-admin-auth':'italian-pizza-customer-auth',path:'/',sameSite:'lax'},cookies:{getAll:()=>[...jar].map(([name,value])=>({name,value})),setAll:updates=>updates.forEach(({name,value})=>jar.set(name,value))}}
 const client=createServerClient(env.NEXT_PUBLIC_SUPABASE_URL,env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY,options)
 const wrong=token.slice(0,-1)+(token.at(-1)==='0'?'1':'0')
 assert.ok((await client.auth.verifyOtp({email,token:wrong,type:'email'})).error,'Wrong real OTP is denied')
 const verified=checked(await client.auth.verifyOtp({email,token,type:'email'}),'Verify real OTP')
 assert.ok(verified.session&&verified.user.id===created.user.id,'Real session created')
 assert.ok(jar.size>0,'SSR session persisted into cookie jar')
 const fresh=createServerClient(env.NEXT_PUBLIC_SUPABASE_URL,env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY,options)
 assert.equal(checked(await fresh.auth.getUser(),'Restore session').user.id,created.user.id)
 return {id:created.user.id,membership:membership?.id,cookie:()=>[...jar].map(([name,value])=>`${name}=${value}`).join('; ')}
}
async function request(person,port,path){return fetch(`http://localhost:${port}${path}`,{headers:{Cookie:person.cookie(),"x-qazipro-business-slug":"italian-pizza"},redirect:'manual',signal:AbortSignal.timeout(45000)})}
try {
 stage='Customer OTP verification and restoration';const customer=await account()
 for(let i=0;i<2;i++){const response=await request(customer,3100,'/account');assert.equal(response.status,200);assert.ok((await response.text()).includes('SIGNED IN WITH'),'Fresh /account request shows authenticated state')}
 console.log('PASS: real 8-digit customer OTP, wrong-code denial, persisted SSR cookies, authenticated /account across fresh requests')
 stage='Normal customer denied Admin';const denied=await request(customer,3101,'/auth/complete');assert.equal(new URL(denied.headers.get('location')).pathname,'/login');assert.equal(new URL(denied.headers.get('location')).searchParams.get('error'),'unauthorized')
 console.log('PASS: authenticated customer without staff membership denied at Admin OTP completion')
 stage='Staff OTP verification and authorization';const staff=await account(true)
 for(let i=0;i<2;i++){const response=await request(staff,3101,'/auth/complete');assert.equal(new URL(response.headers.get('location')).pathname,'/menu');await response.body?.cancel()}
 const menu=await request(staff,3101,'/menu');assert.equal(menu.status,200);await menu.body?.cancel()
 const payments=await request(staff,3101,'/payments');const paymentsBody=await payments.text();assert.ok((payments.status>=300&&payments.status<400)||paymentsBody.includes('NEXT_REDIRECT')||paymentsBody.includes('__next-page-redirect'))
 checked(await provider.from('staff_memberships').update({is_active:false}).eq('id',staff.membership),'Deactivate temporary staff')
 const revoked=await request(staff,3101,'/auth/complete');assert.equal(new URL(revoked.headers.get('location')).searchParams.get('error'),'membership-inactive')
 console.log('PASS: staff real OTP/session restoration, exact landing route, denied Payments and immediately revoked inactive membership')
}catch(error){failed=true;console.error(`FAIL: ${stage}; ${error instanceof Error?error.message:'details omitted'}`)}
finally{
 for(const id of users){const result=await provider.auth.admin.deleteUser(id);if(result.error){failed=true;console.error('Temporary OTP account cleanup failed')}}
 assert.equal(await ownerFingerprint(),before,'Existing OWNER must remain unchanged')
 console.log('Temporary OTP accounts removed; existing OWNER fingerprint unchanged. No email sent and no credentials printed.')
}
if(failed)process.exitCode=1
