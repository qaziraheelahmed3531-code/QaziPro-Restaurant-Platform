// Explicit staging-only, password-based fixtures: never calls an email transport.
import assert from 'node:assert/strict';
import { randomUUID, randomBytes } from 'node:crypto';
import { existsSync } from 'node:fs';
import { mkdir, readFile } from 'node:fs/promises';
import { createClient } from '@supabase/supabase-js';
import { chromium, expect } from 'playwright/test';

process.loadEnvFile('apps/super-admin/.env.local');
const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
const origin = process.env.QUALITY_APP_URL ?? 'http://localhost:3102';
if (process.env.ALLOW_STAGING_ACCEPTANCE !== '1' || process.env.APP_ENVIRONMENT !== 'staging' || new URL(url).hostname !== 'jzisqjvroxodvmqxzsob.supabase.co' || !['localhost','superadmin.qazipro.com'].includes(new URL(origin).hostname)) throw Error('Verified staging resources required');
const admin = createClient(url, process.env.SUPABASE_SERVICE_ROLE_KEY, { auth: { persistSession: false } });
const client = createClient(url, process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY, { auth: { persistSession: false } });
const createdUsers = [];
let browser, page, businessId, originalBranding, uploadedBranding, owner;
const tests = [];
const check = (name, condition) => { assert.ok(condition, name); tests.push(name); console.log(`PASS ${name}`); };
function checked(result) { if (result.error) throw Error(result.error.code ?? 'Database operation failed'); return result.data; }
async function identity(role) {
  const email = `qa-quality-${randomUUID()}@staging.qazipro.invalid`, password = randomBytes(30).toString('base64url');
  const user = checked(await admin.auth.admin.createUser({ email, password, email_confirm: true })).user;
  createdUsers.push(user.id);
  if (role) {
    const record = checked(await admin.from('platform_roles').select('id').eq('key', role).single());
    checked(await admin.from('platform_staff').insert({ user_id: user.id, email, display_name: 'QA Quality Owner', status: 'ACTIVE' }));
    checked(await admin.from('platform_staff_roles').insert({ staff_user_id: user.id, role_id: record.id }));
  }
  const sessionClient = createClient(url, process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY, { auth: { persistSession: false } });
  return { client: sessionClient, session: checked(await sessionClient.auth.signInWithPassword({ email, password })).session };
}
function cookies(session) {
  const chunks = (`base64-${Buffer.from(JSON.stringify(session)).toString('base64url')}`).match(/.{1,3000}/g);
  return chunks.map((value, i) => ({ name: chunks.length === 1 ? 'qazipro-platform-auth' : `qazipro-platform-auth.${i}`, value, url: origin, sameSite: 'Lax' }));
}
try {
  owner = await identity('PLATFORM_OWNER');
  const outsider = await identity(null);
  const chrome = 'C:/Program Files/Google/Chrome/Application/chrome.exe';
  browser = await chromium.launch({ headless: true, ...(existsSync(chrome) ? { executablePath: chrome } : {}) });
  const context = await browser.newContext({ viewport: { width: 1440, height: 900 } });
  await context.addCookies(cookies(owner.session));
  page = await context.newPage();
  page.setDefaultTimeout(20000);
  const errors = [];
  page.on('pageerror', error => errors.push(error.message));
  const routes = ['/', '/restaurants', '/onboarding', '/onboarding/new', '/branches', '/apps', '/domains', '/deployments', '/health', '/support', '/billing', '/packages', '/tasks', '/team', '/integrations', '/audit', '/settings'];
  for (const route of routes) {
    await page.goto(origin + route, { waitUntil: 'domcontentloaded' });
    await expect(page.locator('main h1')).toBeVisible();
    check(`route ${route}`, new URL(page.url()).pathname === route);
    await expect(page.getByText('Platform data is temporarily unavailable.', { exact: true })).toHaveCount(0);
  }
  check('page runtime errors', errors.length === 0);
  await page.goto(origin + '/restaurants');
  await expect(page.getByRole('button', { name: /Search restaurants/ })).toBeEnabled();
  await page.keyboard.press('Control+k');
  await expect(page.getByRole('dialog', { name: 'Search QaziPro' })).toBeVisible();
  await page.getByRole('textbox', { name: 'Search restaurants, owners, branches and domains' }).fill('Kings');
  await expect(page.getByRole('dialog').getByRole('link', { name: /Kings/i }).first()).toBeVisible();
  check('canonical search results', true);
  await page.keyboard.press('Escape');
  await expect(page.getByRole('dialog')).toHaveCount(0);
  check('search escape closes', true);
  for (const status of [400,401,403,409,500]) {
    await page.route('**/api/search?**', route => route.fulfill({ status, contentType: 'application/json', body: '{}' }));
    await page.keyboard.press('Control+k');
    await page.getByRole('textbox', { name: 'Search restaurants, owners, branches and domains' }).fill('test');
    await expect(page.getByRole('dialog', { name: 'Search QaziPro' }).getByRole('alert')).toContainText('Search couldn');
    check(`search error ${status}`, true);
    await page.keyboard.press('Escape');
    await page.unroute('**/api/search?**');
  }
  await page.route('**/api/search?**', route => route.abort());
  await page.keyboard.press('Control+k');
  await page.getByRole('textbox', { name: 'Search restaurants, owners, branches and domains' }).fill('test');
  await expect(page.getByRole('dialog', { name: 'Search QaziPro' }).getByRole('alert')).toContainText('Search couldn');
  check('search network failure', true);
  await page.keyboard.press('Escape');
  await page.unroute('**/api/search?**');
  for (const width of [360,390,768,1366,1920]) {
    await page.setViewportSize({ width, height: 900 });
    await page.goto(origin + '/settings');
    await expect(page.getByRole('heading', { name: 'QaziPro Branding', exact: true })).toBeVisible();
    check(`no page overflow ${width}`, await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth));
    if (width < 900) {
      await page.getByRole('button', { name: 'Open menu', exact: true }).click();
      await expect(page.getByRole('dialog', { name: 'Navigation' })).toBeVisible();
      check(`mobile background inert ${width}`, await page.locator('.platform-body').evaluate(el => el.inert));
      await page.keyboard.press('Escape');
      await expect(page.getByRole('button', { name: 'Open menu', exact: true })).toBeFocused();
    }
  }
  await page.setViewportSize({ width: 1440, height: 900 });
  originalBranding = checked(await admin.from('platform_branding').select('*').single());
  await page.goto(origin + '/settings');
  await expect(page.getByRole('button', { name: 'Save branding', exact: true })).toBeEnabled();
  const currentLogo = originalBranding.logo_path
    ? Buffer.from(await (await fetch(`${url}/storage/v1/object/public/platform-branding/${originalBranding.logo_path}`)).arrayBuffer())
    : await readFile('apps/super-admin/public/qazipro-logo.png');
  await page.getByLabel('Primary logo', { exact: true }).setInputFiles({ name:'qazipro.png', mimeType:'image/png', buffer:currentLogo });
  let brandingRequests = 0;
  const countBranding = request => { if (request.method() === 'POST' && new URL(request.url()).pathname === '/settings') brandingRequests++; };
  page.on('request', countBranding);
  await page.getByRole('button', { name:'Save branding', exact:true }).evaluate(button => { button.form.requestSubmit(button); button.form.requestSubmit(button); });
  await expect(page.getByRole('status')).toContainText('QaziPro branding saved');
  uploadedBranding = checked(await admin.from('platform_branding').select('*').single());
  check('branding duplicate submit one request', brandingRequests === 1);
  page.off('request', countBranding);
  check('branding uploaded and versioned', uploadedBranding.version === originalBranding.version + 1 && uploadedBranding.logo_path !== originalBranding.logo_path);
  await expect(page.locator('.platform-brand img')).toHaveAttribute('src', new RegExp(uploadedBranding.logo_path));
  check('branding propagated to shell', true);
  const publicPage = await browser.newPage();
  await publicPage.goto(origin + '/login');
  await expect(publicPage.getByAltText('QaziPro')).toHaveAttribute('src', new RegExp(uploadedBranding.logo_path));
  check('branding propagated to login', true);
  if (!originalBranding.icon_path) {
    await expect(publicPage.locator('link[rel="icon"]').first()).toHaveAttribute('href', new RegExp(uploadedBranding.logo_path));
    check('branding propagated to favicon', true);
  }
  await publicPage.close();
  checked(await owner.client.rpc('platform_save_branding', { p_logo_path:originalBranding.logo_path,p_icon_path:originalBranding.icon_path,p_expected_version:uploadedBranding.version }));
  checked(await admin.storage.from('platform-branding').remove([uploadedBranding.logo_path]));
  uploadedBranding = undefined;
  originalBranding = checked(await admin.from('platform_branding').select('*').single());
  await page.goto(origin + '/settings');
  await page.getByRole('button', { name:'Reset to default', exact:true }).click();
  await expect(page.getByRole('dialog', { name:'Reset QaziPro branding?' })).toBeVisible();
  await expect(page.getByRole('button', { name:'Cancel', exact:true })).toBeFocused();
  await page.keyboard.press('Escape');
  await expect(page.getByRole('dialog')).not.toBeVisible();
  check('branding reset cancel safe', checked(await admin.from('platform_branding').select('version').single()).version === originalBranding.version);
  await page.getByLabel('Primary logo', { exact: true }).setInputFiles({ name: 'unsafe.svg', mimeType: 'image/svg+xml', buffer: Buffer.from('<svg/>') });
  await page.getByRole('button', { name: 'Save branding', exact: true }).click();
  await expect(page.locator('main').getByRole('alert')).toContainText('Upload failed');
  const after = checked(await admin.from('platform_branding').select('*').single());
  check('failed branding upload preserves previous asset', after.version === originalBranding.version && after.logo_path === originalBranding.logo_path);
  const deniedContext = await browser.newContext();
  await deniedContext.addCookies(cookies(outsider.session));
  const denied = await deniedContext.newPage();
  await denied.goto(origin + '/settings');
  await expect(denied).toHaveURL(/login\?error=unauthorized/);
  check('nonstaff denied', true);
  check('nonstaff search denied', (await deniedContext.request.get(origin + '/api/search?q=Kings')).status() === 401);
  const brandingDenied = await outsider.client.rpc('platform_save_branding', { p_logo_path: null, p_icon_path: null, p_expected_version: originalBranding.version });
  check('branding RPC denies nonstaff', brandingDenied.error?.code === '42501');
  const business = checked(await admin.from('businesses').insert({ name: 'QA Quality Fixture', slug: `qa-quality-${randomUUID()}`, is_active: false }).select('id').single());
  businessId = business.id;
  const args = { p_business_id: businessId, p_capability: 'loyalty', p_enabled: true, p_expected_updated_at: null, p_request_id: randomUUID() };
  check('entitlement RPC denies nonstaff', (await outsider.client.rpc('platform_set_entitlement', args)).error?.code === '42501');
  const stamp = checked(await owner.client.rpc('platform_set_entitlement', args));
  checked(await owner.client.rpc('platform_set_entitlement', args));
  const logs = await admin.from('platform_audit_logs').select('id', { count: 'exact' }).eq('request_id', args.p_request_id);
  check('idempotent entitlement retry one audit', logs.count === 1);
  const conflict = await owner.client.rpc('platform_set_entitlement', { ...args, p_request_id: randomUUID(), p_enabled: false });
  check(`stale entitlement rejected (${conflict.error?.code ?? 'no error'})`, conflict.error?.code === 'PT409');
  checked(await owner.client.rpc('platform_set_entitlement', { ...args, p_request_id: randomUUID(), p_enabled: false, p_expected_updated_at: stamp }));
  check('entitlement update persisted', checked(await owner.client.from('service_entitlements').select('enabled').eq('business_id', businessId).single()).enabled === false);
  await page.goto(origin + '/');
  await page.reload();
  await expect(page.locator('main h1')).toBeVisible();
  check('session restore', true);
  await mkdir('D:/qazipro-quality-evidence', { recursive: true });
  await page.screenshot({ path: 'D:/qazipro-quality-evidence/overview.png' });
  await page.goto(origin + '/settings');
  await page.screenshot({ path: 'D:/qazipro-quality-evidence/settings.png' });
  await page.locator('.account-menu summary').click();
  await page.getByRole('button', { name: 'Sign out', exact: true }).click();
  await expect(page).toHaveURL(/login/);
  check('logout', true);
  console.log(JSON.stringify({ ok: true, assertions: tests.length, tests, public: origin.startsWith('https:'), realGoogleLogin: 'NOT TESTED', emailSent: false }, null, 2));
} catch (error) {
  await mkdir('D:/qazipro-quality-evidence', { recursive: true });
  if (page) await page.screenshot({ path: 'D:/qazipro-quality-evidence/failure.png' }).catch(() => {});
  console.error(JSON.stringify({ ok: false, passed: tests, error: error.message.split('\n').slice(0, 6).join('\n') }));
  process.exitCode = 1;
} finally {
  if (browser) await browser.close();
  if (uploadedBranding && owner) {
    const current = checked(await admin.from('platform_branding').select('*').single());
    if (current.version === uploadedBranding.version && current.logo_path === uploadedBranding.logo_path) {
      checked(await owner.client.rpc('platform_save_branding', {p_logo_path:originalBranding.logo_path,p_icon_path:originalBranding.icon_path,p_expected_version:current.version}));
      checked(await admin.storage.from('platform-branding').remove([uploadedBranding.logo_path]));
    } else console.error('Branding changed concurrently; automatic restore skipped to preserve the newer owner change.');
  }
  if (businessId) {
    checked(await admin.from('service_entitlements').delete().eq('business_id', businessId));
    checked(await admin.from('platform_audit_logs').delete().eq('business_id', businessId));
    checked(await admin.from('businesses').delete().eq('id', businessId));
  }
  for (const id of createdUsers) {
    checked(await admin.from('platform_audit_logs').delete().eq('actor_user_id', id));
    checked(await admin.from('platform_staff').delete().eq('user_id', id));
    checked(await admin.auth.admin.deleteUser(id));
  }
}
