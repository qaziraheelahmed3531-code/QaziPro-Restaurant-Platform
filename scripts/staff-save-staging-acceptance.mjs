import assert from 'node:assert/strict';
import { randomUUID, randomBytes } from 'node:crypto';
import { createClient } from '@supabase/supabase-js';
import { chromium, expect } from 'playwright/test';

const ref = 'jzisqjvroxodvmqxzsob';
const url = process.env.STAGING_SUPABASE_URL, key = process.env.STAGING_SUPABASE_PUBLISHABLE_KEY;
const origin = process.env.STAGING_ADMIN_URL || 'http://localhost:3101';
if (process.env.ALLOW_STAGING_ACCEPTANCE !== '1' || process.env.STAGING_SUPABASE_PROJECT_REF !== ref ||
    new URL(url).hostname !== `${ref}.supabase.co` || !/^(localhost|127\.0\.0\.1)$|\.staging\.qazipro\.com$/.test(new URL(origin).hostname)) throw Error('Staging only');
const service = createClient(url, process.env.STAGING_SUPABASE_SERVICE_ROLE_KEY, { auth: { persistSession: false } });
const marker = `staff-save-${randomUUID()}`, password = randomBytes(24).toString('base64url') + '!a9';
const inviteEmail = `${marker}-invite@staging.qazipro.invalid`;
const users = []; let browser, branch, checks = 0;
const data = (r) => { if (r.error) throw Error(r.error.message); return r.data; };
const pass = label => { checks++; console.log(`PASS ${checks}: ${label}`); };
async function user(kind, owner = false) {
  const email = `${marker}-${kind}@staging.qazipro.invalid`;
  const created = data(await service.auth.admin.createUser({ email, password, email_confirm: true })).user;
  users.push(created.id);
  if (owner) data(await service.from('staff_memberships').insert({ business_id: branch.business_id, user_id: created.id, role: 'OWNER', is_active: true }));
  const client = createClient(url, key, { auth: { persistSession: false, autoRefreshToken: false } });
  const session = data(await client.auth.signInWithPassword({ email, password })).session;
  return { email, id: created.id, client, session };
}
const cookies = session => {
  const chunks = (`base64-${Buffer.from(JSON.stringify(session)).toString('base64url')}`).match(/.{1,3000}/g);
  return chunks.map((value, i) => ({ name: chunks.length === 1 ? 'italian-pizza-admin-auth' : `italian-pizza-admin-auth.${i}`, value, url: origin, sameSite: 'Lax' }));
};
try {
  branch = data(await service.from('branches').select('id,business_id,businesses!branches_business_id_fkey!inner(is_active)').eq('is_active', true).eq('businesses.is_active', true).order('created_at').limit(1).single());
  const owner = await user('owner', true), employee = await user('employee');
  browser = await chromium.launch({ headless: true, channel: 'chrome' });
  const context = await browser.newContext({ viewport: { width: 1366, height: 768 } });
  await context.addCookies(cookies(owner.session));
  const page = await context.newPage(); const errors = [];
  page.on('pageerror', e => errors.push(e.message));
  await page.goto(`${origin}/users`, { waitUntil: 'domcontentloaded', timeout: 90000 });
  await expect(page.getByRole('heading', { name: 'Staff & roles', exact: true })).toBeVisible({ timeout: 60000 });
  const add = async email => {
    await page.getByRole('button', { name: 'Add staff', exact: true }).click();
    const dialog = page.getByRole('dialog');
    await dialog.getByLabel('Employee email').fill(email);
    await dialog.getByLabel('Allowed branches').selectOption(branch.id);
    await dialog.getByLabel('Role preset').selectOption('WAITER');
    return dialog;
  };
  let dialog = await add(employee.email);
  let result = page.waitForResponse(r => r.url().endsWith('/api/staff') && r.request().method() === 'POST');
  await dialog.getByRole('button', { name: 'Save changes', exact: true }).click();
  assert.equal((await (await result).json()).saved, true);
  await expect(dialog).toHaveCount(0); pass('Existing confirmed employee added through actual Staff UI/API');
  await page.reload();
  let row = page.getByRole('row').filter({ hasText: employee.email }).filter({ has: page.getByRole('button', { name: 'Edit access', exact: true }) });
  await expect(row).toContainText('WAITER');
  await row.getByRole('button', { name: 'Edit access', exact: true }).click();
  dialog = page.getByRole('dialog');
  await dialog.getByLabel('Role preset').selectOption('RIDER');
  await dialog.getByLabel('Active', { exact: true }).uncheck();
  await dialog.getByRole('button', { name: 'Save changes', exact: true }).click();
  await expect(dialog).toHaveCount(0); await page.reload();
  row = page.getByRole('row').filter({ hasText: employee.email }).filter({ has: page.getByRole('button', { name: 'Edit access', exact: true }) });
  await expect(row).toContainText('RIDER'); await expect(row).toContainText('Inactive');
  const membership = data(await service.from('staff_memberships').select('id,role,is_active,staff_membership_branches(branch_id)').eq('business_id', branch.business_id).eq('user_id', employee.id).single());
  assert.equal(membership.role, 'RIDER'); assert.equal(membership.is_active, false);
  assert.deepEqual(membership.staff_membership_branches.map(b => b.branch_id), [branch.id]);
  pass('Role, active state and branch persisted after reload and direct database read');
  dialog = await add(inviteEmail);
  await dialog.getByLabel('Active', { exact: true }).uncheck(); // No external invitation email.
  await dialog.getByRole('button', { name: 'Save changes', exact: true }).click();
  await expect(dialog).toHaveCount(0); await page.reload();
  await expect(page.getByRole('row').filter({ hasText: inviteEmail })).toContainText('WAITER');
  assert.equal(data(await service.from('staff_invitations').select('role,is_active').eq('business_id', branch.business_id).eq('email', inviteEmail).single()).role, 'WAITER');
  pass('New invitation saved and survived reload without sending email');
  const payload = { p_business_id: branch.business_id, p_branch_ids: [branch.id], p_email: employee.email, p_role: 'WAITER', p_active: true, p_permissions: [] };
  for (const p_email of ['missing-at.example.com', 'bad@address', 'bad space@example.com', 'bad\tname@example.com']) {
    const invalid = await owner.client.rpc('save_staff_by_email_v2', { ...payload, p_email });
    assert.equal(invalid.error?.code, '22023');
  }
  pass('Malformed emails denied by server');
  assert.equal((await employee.client.rpc('save_staff_by_email_v2', payload)).error?.code, '42501');
  pass('Unauthorized staff denied by canonical RPC');
  const foreign = data(await service.from('branches').select('id').neq('business_id', branch.business_id).eq('is_active', true).limit(1).single());
  assert.equal((await owner.client.rpc('save_staff_by_email_v2', { ...payload, p_branch_ids: [foreign.id] })).error?.code, '22023');
  pass('Cross-restaurant branch assignment denied');
  if (new URL(origin).hostname === 'localhost') {
    dialog = await add(employee.email);
    await page.route('**/api/staff', route => route.fulfill({ status: 400, contentType: 'application/json', body: JSON.stringify({ error: 'Regression: save denied.' }) }));
    await dialog.getByRole('button', { name: 'Save changes', exact: true }).click();
    await expect(dialog.getByRole('alert')).toHaveText('Regression: save denied.');
    await expect(dialog.getByRole('alert')).toBeInViewport();
    await expect(dialog.getByRole('button', { name: 'Save changes', exact: true })).toBeEnabled();
    await page.unroute('**/api/staff');
    pass('Software error boundary: failure visible inside dialog; draft retained and retry enabled');
  }
  assert.deepEqual(errors, []); pass('No browser runtime errors');
  console.log(JSON.stringify({ ok: true, checks, origin }));
} finally {
  if (browser) await browser.close();
  if (branch) await service.from('staff_invitations').delete().eq('business_id', branch.business_id).eq('email', inviteEmail);
  for (const id of users.reverse()) {
    await service.from('staff_memberships').delete().eq('user_id', id);
    await service.auth.admin.deleteUser(id);
  }
}
