// Real browser mutations against isolated, inactive staging fixtures; no email.
import assert from 'node:assert/strict';
import {randomUUID,randomBytes} from 'node:crypto';
import {createClient} from '@supabase/supabase-js';
import {chromium,expect as baseExpect} from 'playwright/test';
const expect=baseExpect.configure({timeout:30000});
process.loadEnvFile('apps/super-admin/.env.local');
const origin=process.env.QUALITY_APP_URL??'http://localhost:3102',url=process.env.NEXT_PUBLIC_SUPABASE_URL;
if(process.env.ALLOW_STAGING_ACCEPTANCE!=='1'||process.env.APP_ENVIRONMENT!=='staging'||new URL(url).hostname!=='jzisqjvroxodvmqxzsob.supabase.co'||!['localhost','superadmin.qazipro.com'].includes(new URL(origin).hostname))throw Error('Staging required');
const admin=createClient(url,process.env.SUPABASE_SERVICE_ROLE_KEY,{auth:{persistSession:false}});
const run=randomUUID().replaceAll('-',''),name='QA modules '+run;
let userId,businessId,browser,page;
const tests=[];function checked(r){if(r.error)throw Error(r.error.code);return r.data;}
function pass(label){tests.push(label);console.log('PASS '+label);}
async function go(path){await page.goto(origin+path);await expect(page.getByRole('button',{name:/Search restaurants/})).toBeEnabled();}
async function save(label,notice){await page.getByRole('button',{name:label,exact:true}).click();await expect(page.getByText(notice,{exact:true})).toBeVisible();}
async function confirm(button){await button.click();await page.getByRole('dialog',{name:'Confirm change',exact:true}).getByRole('button',{name:'Confirm change',exact:true}).click();await expect(page.getByRole('dialog',{name:'Confirm change',exact:true})).not.toBeVisible();}
async function count(table){return checked(await admin.from(table).select('id').eq('business_id',businessId));}
try{
 const email='qa-modules-'+run+'@staging.qazipro.invalid',password=randomBytes(30).toString('base64url');
 userId=checked(await admin.auth.admin.createUser({email,password,email_confirm:true})).user.id;
 const role=checked(await admin.from('platform_roles').select('id').eq('key','PLATFORM_OWNER').single());
 checked(await admin.from('platform_staff').insert({user_id:userId,email,display_name:'QA Module Owner',status:'ACTIVE'}));
 checked(await admin.from('platform_staff_roles').insert({staff_user_id:userId,role_id:role.id}));
 businessId=checked(await admin.from('businesses').insert({name,slug:'qa-modules-'+run,is_active:false}).select('id').single()).id;
 const client=createClient(url,process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY,{auth:{persistSession:false}});
 const session=checked(await client.auth.signInWithPassword({email,password})).session;
 browser=await chromium.launch({headless:true,executablePath:'C:/Program Files/Google/Chrome/Application/chrome.exe'});
 const context=await browser.newContext({viewport:{width:1440,height:900}});
 const chunks=('base64-'+Buffer.from(JSON.stringify(session)).toString('base64url')).match(/.{1,3000}/g);
 await context.addCookies(chunks.map((value,i)=>({name:chunks.length===1?'qazipro-platform-auth':'qazipro-platform-auth.'+i,value,url:origin,sameSite:'Lax'})));
 page=await context.newPage();const errors=[];page.on('pageerror',error=>errors.push(error.message));
 await go('/tasks');await page.getByLabel('Title',{exact:true}).fill(name);await page.getByRole('combobox',{name:/^Restaurant/}).selectOption(businessId);
 await save('Create task','Task workflow updated and audited.');
 assert.equal((await count('platform_tasks')).length,1);
 const task=page.locator('article').filter({hasText:name});
 await task.getByRole('combobox').selectOption('RESOLVED');await task.getByRole('button',{name:'Update',exact:true}).click();
 await expect(task.getByText('RESOLVED',{exact:true}).first()).toBeVisible();
 assert.equal(checked(await admin.from('platform_tasks').select('status').eq('business_id',businessId).single()).status,'RESOLVED');pass('task create/status');
 await go('/support');await page.getByRole('combobox',{name:/^Restaurant/}).selectOption(businessId);await page.getByLabel('Category',{exact:true}).fill('ACCEPTANCE');
 await page.getByLabel('Subject',{exact:true}).fill(name);await page.getByLabel('Description',{exact:true}).fill('Temporary acceptance record; no customer incident.');
 await save('Open ticket','Support ticket opened and audited.');assert.equal((await count('support_tickets')).length,1);pass('support ticket');
 await go('/apps');await page.getByRole('combobox',{name:/^Restaurant/}).selectOption(businessId);await page.getByLabel('App name',{exact:true}).fill(name);
 await page.getByLabel('Application / Bundle ID',{exact:true}).fill('com.qazipro.qa'+run);await page.getByLabel('Purchased / enabled').check();
 await save('Save app registry','App registry updated and audited.');
 const app=checked(await admin.from('mobile_app_records').select('enabled,release_status,credential_status').eq('business_id',businessId).single());
 assert.equal(app.enabled,true);assert.equal(app.release_status,'CONFIGURATION');assert.equal(app.credential_status,'MISSING');pass('app identity without fake release');
 await go('/domains');const host='qa-'+run+'.example.invalid';
 const addDomain=page.locator('form').filter({has:page.getByRole('button',{name:'Add domain',exact:true})});
 await addDomain.getByRole('combobox',{name:/^Restaurant/}).selectOption(businessId);await addDomain.getByLabel('Hostname',{exact:true}).fill(host);
 await save('Add domain','Domain configuration saved.');
 let domain=checked(await admin.from('platform_domain_records').select('*').eq('business_id',businessId).single());assert.equal(domain.verification_status,'PENDING');
 let domainRow=page.locator('article').filter({hasText:host});await domainRow.getByText('Edit pending',{exact:true}).click();
 const changed='qa-edit-'+run+'.example.invalid';await domainRow.getByLabel('Hostname',{exact:true}).fill(changed);
 await confirm(domainRow.getByRole('button',{name:'Save',exact:true}));
 domain=checked(await admin.from('platform_domain_records').select('*').eq('id',domain.id).single());assert.equal(domain.hostname,changed);assert.equal(domain.verification_status,'PENDING');pass('pending hostname edit');
 domainRow=page.locator('article').filter({hasText:changed});await confirm(domainRow.getByRole('button',{name:'Deactivate',exact:true}));
 assert.equal(checked(await admin.from('platform_domain_records').select('is_active').eq('id',domain.id).single()).is_active,false);pass('domain deactivate');
 await go('/health');await page.getByRole('combobox',{name:/^Restaurant/}).selectOption(businessId);
 await page.getByLabel('Component',{exact:true}).fill('ACCEPTANCE');await page.getByLabel('Title',{exact:true}).fill(name);
 await page.getByLabel('Human-readable summary').fill('Temporary browser acceptance signal; not a real outage.');
 await save('Open incident','Incident opened, assigned and audited.');assert.equal((await count('platform_incidents')).length,1);pass('incident evidence');
 await go('/deployments');await page.getByText('Record deployment evidence',{exact:true}).click();await page.getByRole('combobox',{name:/^Restaurant/}).selectOption(businessId);
 await page.getByRole('combobox',{name:/^Status/}).selectOption('CANCELLED');await page.getByLabel('Provider',{exact:true}).fill('Acceptance fixture');
 await save('Save deployment','Deployment evidence recorded and audited.');assert.equal((await count('deployment_records')).length,1);pass('deployment evidence');
 await go('/audit');await expect(page.getByRole('heading',{level:1})).toBeVisible();
 const audits=checked(await admin.from('platform_audit_logs').select('action').eq('business_id',businessId));
 assert.ok(audits.length>=8);assert.equal(errors.length,0);pass('audit and page errors');
 console.log(JSON.stringify({ok:true,tests,public:origin.startsWith('https:'),emailSent:false}));
}catch(error){if(page)await page.screenshot({path:'D:/qazipro-quality-evidence/modules-failure.png',fullPage:true});throw error;}
finally{
 if(browser)await browser.close();
 if(businessId){
  for(const table of ['platform_tasks','support_tickets','mobile_app_records','platform_domain_records','platform_incidents','deployment_records','platform_audit_logs'])checked(await admin.from(table).delete().eq('business_id',businessId));
  checked(await admin.from('businesses').delete().eq('id',businessId));
 }
 if(userId){checked(await admin.from('platform_audit_logs').delete().eq('actor_user_id',userId));checked(await admin.from('platform_staff').delete().eq('user_id',userId));checked(await admin.auth.admin.deleteUser(userId));}
}
