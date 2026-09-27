import assert from 'node:assert/strict';
import {randomUUID,randomBytes} from 'node:crypto';
import {createClient} from '@supabase/supabase-js';
import {chromium,expect as baseExpect} from 'playwright/test';
const expect=baseExpect.configure({timeout:20000});
process.loadEnvFile('apps/super-admin/.env.local');
const origin=process.env.QUALITY_APP_URL??'http://localhost:3102',url=process.env.NEXT_PUBLIC_SUPABASE_URL;
if(process.env.ALLOW_STAGING_ACCEPTANCE!=='1'||process.env.APP_ENVIRONMENT!=='staging'||new URL(url).hostname!=='jzisqjvroxodvmqxzsob.supabase.co'||!['localhost','superadmin.qazipro.com'].includes(new URL(origin).hostname))throw Error('Staging required');
const admin=createClient(url,process.env.SUPABASE_SERVICE_ROLE_KEY,{auth:{persistSession:false}});
const run=randomUUID().replaceAll('-',''),code='QA_FAILURE_'+run.toUpperCase();
let userId,packageId,browser,page;
function checked(r){if(r.error)throw Error(r.error.code);return r.data;}
try{
 const email='qa-form-'+run+'@staging.qazipro.invalid',password=randomBytes(30).toString('base64url');
 userId=checked(await admin.auth.admin.createUser({email,password,email_confirm:true})).user.id;
 const role=checked(await admin.from('platform_roles').select('id').eq('key','PLATFORM_OWNER').single());
 checked(await admin.from('platform_staff').insert({user_id:userId,email,display_name:'QA Form Owner',status:'ACTIVE'}));
 checked(await admin.from('platform_staff_roles').insert({staff_user_id:userId,role_id:role.id}));
 packageId=checked(await admin.from('service_packages').insert({code,name:code,currency:'PKR',base_fee:0,setup_fee:0,included_branches:1,billing_frequency:'MONTHLY',is_active:true}).select('id').single()).id;
 const client=createClient(url,process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY,{auth:{persistSession:false}});
 const session=checked(await client.auth.signInWithPassword({email,password})).session;
 browser=await chromium.launch({headless:true,executablePath:'C:/Program Files/Google/Chrome/Application/chrome.exe'});
 const context=await browser.newContext();
 const chunks=('base64-'+Buffer.from(JSON.stringify(session)).toString('base64url')).match(/.{1,3000}/g);
 await context.addCookies(chunks.map((value,i)=>({name:chunks.length===1?'qazipro-platform-auth':'qazipro-platform-auth.'+i,value,url:origin,sameSite:'Lax'})));
 page=await context.newPage();await page.goto(origin+'/packages');
 await expect(page.getByRole('button',{name:/Search restaurants/})).toBeEnabled();
 const form=page.locator('form').filter({has:page.getByRole('button',{name:'Create package',exact:true})});
 await form.getByLabel('Package code').fill(code);await form.getByLabel('Display name').fill('Keep my typed package name');
 let posts=0;page.on('request',request=>{if(request.method()==='POST')posts++;});
 await form.getByRole('button',{name:'Create package',exact:true}).evaluate(button=>{button.form.requestSubmit(button);button.form.requestSubmit(button);});
 await expect(form.getByRole('alert')).toContainText('Your entries are preserved');
 assert.equal(posts,1);await expect(form.getByLabel('Display name')).toHaveValue('Keep my typed package name');
  assert.equal(new URL(page.url()).search,'');
  const beforePackage=checked(await admin.from('service_packages').select('updated_at').eq('id',packageId).single());
  const editRow=page.locator('article').filter({hasText:code});
  await editRow.getByText('Edit commercial template',{exact:true}).click();
  await editRow.getByLabel('Display name').fill('Updated commercial fixture');
  await editRow.getByLabel('Base fee',{exact:true}).fill('15000');
  await editRow.getByLabel('Audit reason').fill('Browser acceptance template edit');
  await editRow.getByRole('button',{name:'Save package',exact:true}).click();
  await expect(page.getByText('Package updated and audited.',{exact:true})).toBeVisible();
  const persisted=checked(await admin.from('service_packages').select('name,base_fee').eq('id',packageId).single());
  assert.equal(persisted.name,'Updated commercial fixture');assert.equal(persisted.base_fee,15000);
  assert.equal(checked(await admin.from('platform_audit_logs').select('id').eq('target_id',packageId).eq('action','SERVICE_PACKAGE_UPDATED')).length,1);
  const args={p_package_id:packageId,p_expected_updated_at:beforePackage.updated_at,p_payload:{}};
  assert.equal((await client.rpc('platform_update_service_package',args)).error?.code,'PT409');
  const anon=createClient(url,process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY,{auth:{persistSession:false}});
  assert.ok((await anon.rpc('platform_update_service_package',args)).error);
  // Success intentionally resets the creation form; restore user input for transport test.
  await page.goto(origin+'/packages');
  await expect(page.getByRole('button',{name:/Search restaurants/})).toBeEnabled();
  await form.getByLabel('Package code').fill(code);await form.getByLabel('Display name').fill('Keep my typed package name');
 // A concurrent operator removes this test-only record: keep confirmation open.
 const row=page.locator('article').filter({hasText:code});
 await expect(row).toHaveCount(1);
 checked(await admin.from('service_packages').delete().eq('id',packageId));
 await row.getByRole('button',{name:'Deactivate',exact:true}).click();
 const dialog=page.getByRole('dialog',{name:'Confirm change',exact:true});
 await dialog.getByRole('button',{name:'Confirm change',exact:true}).click();
 await expect(dialog.getByRole('alert')).toContainText('no longer available');
 await expect(dialog).toBeVisible();assert.equal(new URL(page.url()).search,'');
 await dialog.getByRole('button',{name:'Cancel',exact:true}).click();await expect(dialog).not.toBeVisible();
 await expect(row.getByRole('button',{name:'Deactivate',exact:true})).toBeFocused();
 // A failed transport must retain inputs and permit another explicit attempt.
 await page.route('**/packages',route=>route.request().method()==='POST'?route.abort():route.continue());
 await form.getByRole('button',{name:'Create package',exact:true}).click();
 await expect(form.getByRole('alert')).toContainText('Your entries are still here');
 await expect(form.getByLabel('Display name')).toHaveValue('Keep my typed package name');
 await expect(form.getByRole('button',{name:'Create package',exact:true})).toBeEnabled();
  console.log(JSON.stringify({ok:true,businessErrorRetainsValues:true,doubleSubmitOneRequest:true,packageEditPersistedAndAudited:true,staleEditDenied:true,anonymousEditDenied:true,failedDialogStaysOpen:true,cancelRestoresFocus:true,networkFailureRetainsValues:true,public:origin.startsWith('https:')}));
}catch(error){if(page)await page.screenshot({path:'D:/qazipro-quality-evidence/form-failure.png',fullPage:true});throw error;}
finally{
 if(browser)await browser.close();
 if(packageId)checked(await admin.from('service_packages').delete().eq('id',packageId));
 if(userId){checked(await admin.from('platform_audit_logs').delete().eq('actor_user_id',userId));checked(await admin.from('platform_staff').delete().eq('user_id',userId));checked(await admin.auth.admin.deleteUser(userId));}
}
