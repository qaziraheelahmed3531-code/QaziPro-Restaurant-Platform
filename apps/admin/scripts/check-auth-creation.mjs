// Controlled Auth health probe: never sends email; deletes its one disposable user.
import { readFileSync } from 'node:fs'
import { randomUUID } from 'node:crypto'
const env=Object.fromEntries(readFileSync(new URL('../.env.local',import.meta.url),'utf8').split(/\r?\n/).filter(l=>/^[A-Z_]+=/.test(l)).map(l=>{const i=l.indexOf('=');return[l.slice(0,i),l.slice(i+1).trim().replace(/^["']|["']$/g,'')]}))
const response=await fetch(`${env.NEXT_PUBLIC_SUPABASE_URL}/auth/v1/admin/users`,{method:'POST',headers:{apikey:env.SUPABASE_SERVICE_ROLE_KEY,Authorization:`Bearer ${env.SUPABASE_SERVICE_ROLE_KEY}`,'Content-Type':'application/json'},body:JSON.stringify({email:`qa-upgrade-${randomUUID()}@example.com`,email_confirm:true}),signal:AbortSignal.timeout(30000)})
const data=await response.json().catch(()=>({}))
console.log(JSON.stringify({httpStatus:response.status,contentType:response.headers.get('content-type'),providerCode:data.code??data.error_code??null,created:Boolean(data.id)}))
if(response.ok&&data.id){
 const cleanup=await fetch(`${env.NEXT_PUBLIC_SUPABASE_URL}/auth/v1/admin/users/${data.id}`,{method:'DELETE',headers:{apikey:env.SUPABASE_SERVICE_ROLE_KEY,Authorization:`Bearer ${env.SUPABASE_SERVICE_ROLE_KEY}`}})
 console.log(`Temporary Auth probe cleanup: HTTP ${cleanup.status}`)
 if(!cleanup.ok)process.exitCode=1
}else process.exitCode=1
