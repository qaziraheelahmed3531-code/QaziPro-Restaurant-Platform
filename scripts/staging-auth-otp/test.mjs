import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { test } from 'node:test'
import { EMAIL_OTP_LENGTH } from '../../packages/shared/src/auth.ts'

const config = readFileSync(new URL('./supabase/config.toml', import.meta.url), 'utf8')
const root = readFileSync(new URL('../../supabase/config.toml', import.meta.url), 'utf8')
const template = readFileSync(new URL('./supabase/templates/sign-in-code.html', import.meta.url), 'utf8')

test('local and narrowly scoped staging email length match the shared UI contract', () => {
  for (const source of [root, config]) {
    const email = source.split('[auth.email]')[1].split('\n[')[0]
    assert.match(email, new RegExp(`otp_length = ${EMAIL_OTP_LENGTH}\\b`))
  }
})

test('sign-in email renders the provider OTP, never a login link or token in subject', () => {
  assert.equal((template.match(/{{\s*\.Token\s*}}/g) || []).length, 1)
  assert.doesNotMatch(template, /ConfirmationURL|TokenHash|SiteURL|RedirectTo|href\s*=/i)
  assert.match(template, /8-digit/)
  assert.match(config, /subject = "Your QaziPro sign-in code"/)
  assert.doesNotMatch(config, /subject[^\n]*Token/)
})

test('staging overlay cannot reset unrelated auth, SMTP or redirect settings', () => {
  const sections = [...config.matchAll(/^\[([^\]]+)\]/gm)].map(match => match[1])
  assert.deepEqual(sections, ['auth.email', 'auth.email.template.magic_link'])
  const keys = [...config.matchAll(/^([a-z_]+)\s*=/gm)].map(match => match[1])
  assert.deepEqual(keys, ['project_id', 'otp_length', 'subject', 'content_path'])
})

test('local and staging config reuse one versioned email template', () => {
  const rootPath = root.match(/\[auth.email.template.magic_link\][\s\S]*?content_path = "([^"]+)"/)[1]
  const localPath = config.match(/content_path = "([^"]+)"/)[1]
  assert.equal(readFileSync(new URL(`../../${rootPath}`, import.meta.url), 'utf8'), template)
  assert.equal(readFileSync(new URL(localPath, import.meta.url), 'utf8'), template)
})
