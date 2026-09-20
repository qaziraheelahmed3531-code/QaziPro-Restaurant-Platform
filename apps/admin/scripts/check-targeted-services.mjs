// Read-only diagnostics. Never print environment values, API keys or provider payloads.
import { readFileSync } from 'node:fs'
import { createHash } from 'node:crypto'
import { createClient } from '@supabase/supabase-js'
const env = Object.fromEntries(readFileSync(new URL('../.env.local', import.meta.url), 'utf8').split(/\r?\n/).filter(line => /^[A-Z_]+=/.test(line)).map(line => {
  const index = line.indexOf('=')
  return [line.slice(0,index), line.slice(index+1).trim().replace(/^["']|["']$/g,'')]
}))
try {
  for (const table of ['businesses','staff_memberships','invoices','staff_invitations']) {
    const response = await fetch(`${env.NEXT_PUBLIC_SUPABASE_URL}/rest/v1/${table}?select=id&limit=1`, { headers: { apikey: env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY, Authorization: `Bearer ${env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY}` }, signal: AbortSignal.timeout(10000) })
    console.log(`${table}: HTTP ${response.status}`)
  }
  const ownerResponse = await fetch(`${env.NEXT_PUBLIC_SUPABASE_URL}/rest/v1/staff_memberships?select=id,business_id,user_id,role,is_active&role=eq.OWNER&is_active=eq.true&order=id`, { headers: { apikey: env.SUPABASE_SERVICE_ROLE_KEY, Authorization: `Bearer ${env.SUPABASE_SERVICE_ROLE_KEY}` } })
  if (ownerResponse.ok) { const owners = await ownerResponse.json(); console.log(JSON.stringify({ activeOwnerCount: owners.length, ownerDigest: createHash('sha256').update(JSON.stringify(owners)).digest('hex') })) }
  const auth = createClient(env.NEXT_PUBLIC_SUPABASE_URL,env.SUPABASE_SERVICE_ROLE_KEY,{auth:{persistSession:false,autoRefreshToken:false}})
  const users = await auth.auth.admin.listUsers({page:1,perPage:1})
  console.log(JSON.stringify({authAdminReadStatus:users.error?.status??200,authAdminReadCode:users.error?.code??'OK'}))
} catch { console.log('Connection check failed; no credentials were printed.') }
