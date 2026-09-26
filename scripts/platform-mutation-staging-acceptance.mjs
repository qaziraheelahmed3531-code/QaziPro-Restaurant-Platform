import assert from 'node:assert/strict';
import { randomUUID, randomBytes } from 'node:crypto';
import { createClient } from '@supabase/supabase-js';
process.loadEnvFile('apps/super-admin/.env.local');
if (process.env.ALLOW_STAGING_ACCEPTANCE !== '1' || process.env.APP_ENVIRONMENT !== 'staging' || new URL(process.env.NEXT_PUBLIC_SUPABASE_URL).hostname !== 'jzisqjvroxodvmqxzsob.supabase.co') throw Error('Staging only');
const options = { auth: { persistSession: false, autoRefreshToken: false }, global: { fetch: (url, options) => fetch(url, { ...options, signal: AbortSignal.timeout(20000) }) } };
const admin = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY, options);
const owner = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL, process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY, options);
let userId, businessId;
function data(result) { if (result.error) throw Error(result.error.code ?? result.error.name); return result.data; }
try {
  const email = `qa-quality-${randomUUID()}@staging.qazipro.invalid`, password = randomBytes(30).toString('base64url');
  userId = data(await admin.auth.admin.createUser({ email, password, email_confirm: true })).user.id;
  const role = data(await admin.from('platform_roles').select('id').eq('key','PLATFORM_OWNER').single());
  data(await admin.from('platform_staff').insert({ user_id: userId, email, display_name:'QA RPC Owner',status:'ACTIVE' }));
  data(await admin.from('platform_staff_roles').insert({staff_user_id:userId,role_id:role.id}));
  data(await owner.auth.signInWithPassword({email,password}));
  businessId = data(await admin.from('businesses').insert({name:'QA RPC Fixture',slug:`qa-rpc-${randomUUID()}`,is_active:false}).select('id').single()).id;
  const args = { p_business_id:businessId,p_capability:'loyalty',p_enabled:true,p_expected_updated_at:null,p_request_id:randomUUID() };
  const stamp = data(await owner.rpc('platform_set_entitlement',args));
  assert.equal(data(await owner.rpc('platform_set_entitlement',args)), stamp);
  const stale = await owner.rpc('platform_set_entitlement',{...args,p_request_id:randomUUID(),p_enabled:false});
  console.log(JSON.stringify({staleCode:stale.error?.code,staleMessage:stale.error?.message,staleStatus:stale.status}));
  assert.equal(stale.error?.code,'PT409');
  assert.equal((await owner.rpc('platform_set_entitlement',{...args,p_enabled:false})).error?.code,'PT409');
  data(await owner.rpc('platform_set_entitlement',{...args,p_request_id:randomUUID(),p_enabled:false,p_expected_updated_at:stamp}));
  const brand = data(await owner.from('platform_branding').select('*').single());
  assert.equal((await owner.rpc('platform_save_branding',{p_logo_path:brand.logo_path,p_icon_path:brand.icon_path,p_expected_version:null})).error?.code,'PT409');
  console.log('PASS atomic entitlement replay, stale update, changed replay, valid update, missing branding version');
} finally {
  if (businessId) {
    data(await admin.from('service_entitlements').delete().eq('business_id',businessId));
    data(await admin.from('platform_audit_logs').delete().eq('business_id',businessId));
    data(await admin.from('businesses').delete().eq('id',businessId));
  }
  if (userId) { data(await admin.from('platform_staff').delete().eq('user_id',userId)); data(await admin.auth.admin.deleteUser(userId)); }
}
