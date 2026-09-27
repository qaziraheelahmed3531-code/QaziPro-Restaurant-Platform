import assert from 'node:assert/strict';
import {randomUUID,randomBytes} from 'node:crypto';
import {createClient} from '@supabase/supabase-js';
import {chromium,expect} from 'playwright/test';
process.loadEnvFile('apps/super-admin/.env.local');
const origin=process.env.QUALITY_APP_URL??'http://localhost:3102';
const url=process.env.NEXT_PUBLIC_SUPABASE_URL;
if(process.env.ALLOW_STAGING_ACCEPTANCE!=='1'||process.env.APP_ENVIRONMENT!=='staging'||new URL(url).hostname!=='jzisqjvroxodvmqxzsob.supabase.co'||!['localhost','superadmin.qazipro.com'].includes(new URL(origin).hostname))throw Error('Staging required');
const admin=createClient(url,process.env.SUPABASE_SERVICE_ROLE_KEY,{auth:{persistSession:false}});
const ids=[];let incident,browser;
function checked(r){if(r.error)throw Error(r.error.code);return r.data;}
async function user(role){
 const email=`qa-attention-${randomUUID()}@staging.qazipro.invalid`,password=randomBytes(30).toString('base64url');
 const id=checked(await admin.auth.admin.createUser({email,password,email_confirm:true})).user.id;ids.push(id);
 if(role){const r=checked(await admin.from('platform_roles').select('id').eq('key','PLATFORM_OWNER').single());checked(await admin.from('platform_staff').insert({user_id:id,email,display_name:'QA Attention Owner',status:'ACTIVE'}));checked(await admin.from('platform_staff_roles').insert({staff_user_id:id,role_id:r.id}));}
 const client=createClient(url,process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY,{auth:{persistSession:false}});
 return {id,client,session:checked(await client.auth.signInWithPassword({email,password})).session};
}
async function context(who){const c=await browser.newContext();const chunks=(`base64-${Buffer.from(JSON.stringify(who.session)).toString('base64url')}`).match(/.{1,3000}/g);await c.addCookies(chunks.map((value,i)=>({name:chunks.length===1?'qazipro-platform-auth':`qazipro-platform-auth.${i}`,value,url:origin,sameSite:'Lax'})));return c;}
try{
 const a=await user(true),b=await user(true),outsider=await user(false);
 incident=checked(await admin.from('platform_incidents').insert({title:`QA attention ${randomUUID()}`,component:'SUPER_ADMIN',summary:'Temporary acceptance fixture',severity:'WARNING',status:'OPEN'}).select('id,title,last_seen_at').single());
 browser=await chromium.launch({headless:true,executablePath:'C:/Program Files/Google/Chrome/Application/chrome.exe'});
 const c=await context(a),page=await c.newPage();await page.goto(origin+'/');
 await page.getByRole('button',{name:/Notifications/}).click();
 const dialog=page.getByRole('dialog',{name:'Notifications',exact:true});
 await expect(dialog).toBeVisible();
 const row=dialog.locator('article').filter({hasText:incident.title});
 await expect(row.getByRole('button',{name:'Mark read'})).toBeVisible({timeout:20000});
 await row.getByRole('button',{name:'Mark read'}).click();await expect(row.getByText('Read',{exact:true})).toBeVisible({timeout:20000});
 await page.keyboard.press('Escape');await expect(dialog).not.toBeVisible();
 const aResult=await (await c.request.get(origin+'/api/attention')).json();
 assert.equal(aResult.items.find(i=>i.title===incident.title).read,true);
 const second=await context(b),bResult=await (await second.request.get(origin+'/api/attention')).json();assert.equal(bResult.items.find(i=>i.title===incident.title).read,false);
 assert.equal(checked(await b.client.from('platform_attention_receipts').select('*').eq('user_id',a.id)).length,0);
 assert.ok((await b.client.from('platform_attention_receipts').insert({user_id:a.id,event_key:'forged'})).error);
 assert.ok((await outsider.client.from('platform_attention_receipts').insert({user_id:outsider.id,event_key:'forged'})).error);
 const denied=await context(outsider);assert.equal((await denied.request.get(origin+'/api/attention')).status(),401);
 checked(await admin.from('platform_incidents').update({status:'RESOLVED'}).eq('id',incident.id));
 const resolved=await (await c.request.get(origin+'/api/attention')).json();assert.equal(resolved.items.some(i=>i.title===incident.title),false);
 console.log(JSON.stringify({ok:true,notificationRendered:true,markReadPersisted:true,staffIsolation:true,nonstaffDenied:true,resolvedRemoved:true,public:origin.startsWith('https:')}));
}finally{
 if(browser)await browser.close();
 if(incident)checked(await admin.from('platform_incidents').delete().eq('id',incident.id));
 for(const id of ids){checked(await admin.from('platform_attention_receipts').delete().eq('user_id',id));checked(await admin.from('platform_staff').delete().eq('user_id',id));checked(await admin.auth.admin.deleteUser(id));}
}
