import assert from "node:assert/strict"
import { randomUUID } from "node:crypto"
import { readFileSync } from "node:fs"
import { chromium } from "playwright"
import { createClient } from "@supabase/supabase-js"
import { createServerClient } from "@supabase/ssr"

const origin=process.argv[2]??"http://localhost:3001"
const targetHost=new URL(origin).hostname
assert.ok(targetHost==="localhost"||targetHost==="admin.staging.qazipro.com"||/^qazipro-restaurant-admin-staging-[a-z0-9]+\.vercel\.app$/.test(targetHost),"Apps acceptance target must be loopback or the canonical Admin staging deployment")
const env=Object.fromEntries(readFileSync(new URL("../.env.local",import.meta.url),"utf8").split(/\r?\n/).filter(line=>/^[A-Z_]+=/.test(line)).map(line=>{const index=line.indexOf("=");return[line.slice(0,index),line.slice(index+1).trim().replace(/^[\"']|[\"']$/g,"")] }))
const provider=createClient(env.NEXT_PUBLIC_SUPABASE_URL,env.SUPABASE_SERVICE_ROLE_KEY,{auth:{persistSession:false,autoRefreshToken:false}})
const email=`qa-apps-${randomUUID()}@example.test`,password=`Qa!${randomUUID()}`
let userId,membershipId,browser,failed=false
const check=(result,label)=>{if(result.error)throw new Error(`${label}: ${result.error.code??result.error.status??"provider error"}`);return result.data}
try{
  const branch=check(await provider.from("branches").select("id,business_id").eq("id","22222222-2222-4222-8222-222222222222").single(),"Resolve staging branch")
  const user=check(await provider.auth.admin.createUser({email,password,email_confirm:true,user_metadata:{full_name:"QA Apps Owner"}}),"Create disposable owner").user;userId=user.id
  membershipId=check(await provider.from("staff_memberships").insert({business_id:branch.business_id,branch_id:null,user_id:userId,role:"OWNER",is_active:true,permissions_customized:false}).select("id").single(),"Create owner membership").id
  const jar=new Map(),client=createServerClient(env.NEXT_PUBLIC_SUPABASE_URL,env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY,{cookieOptions:{name:"italian-pizza-admin-auth",path:"/",sameSite:"lax"},cookies:{getAll:()=>[...jar].map(([name,value])=>({name,value})),setAll:items=>items.forEach(({name,value})=>jar.set(name,value))}})
  check(await client.auth.signInWithPassword({email,password}),"Sign in disposable owner")
  browser=await chromium.launch({channel:"chrome",headless:true})
  const context=await browser.newContext({viewport:{width:390,height:844}})
  await context.addCookies([...jar].map(([name,value])=>({name,value,domain:targetHost,path:"/",sameSite:"Lax",secure:targetHost!=="localhost"})))
  const page=await context.newPage(),errors=[]
  page.on("console",message=>{if(message.type()==="error")errors.push(message.text())})
  await page.goto(new URL("/apps",origin).href,{waitUntil:"networkidle",timeout:90000})
  await page.getByRole("heading",{name:"Apps & access",exact:true}).waitFor()
  await page.getByRole("link",{name:"Manage staff & branch access",exact:true}).waitFor()
  await page.getByText("Restaurant Admin",{exact:true}).first().waitFor()
  await page.getByText("Waiter",{exact:true}).first().waitFor()
  await page.getByText("Rider",{exact:true}).first().waitFor()
  assert.equal(await page.getByText("Publication pending",{exact:true}).count(),2,"Unpublished releases must not render fake links")
  assert.equal(errors.length,0,`Browser console errors: ${errors.join(" | ")}`)
  await context.close()
  console.log("PASS: mobile Apps & Access loaded at 390x844, exposed role/branch management, and withheld unverified Android/iOS download links")
}catch(error){failed=true;console.error(`FAIL: ${error instanceof Error?error.message:"apps access test failed"}`)}finally{
  if(browser)await browser.close().catch(()=>{})
  if(userId){await provider.from("audit_logs").delete().eq("actor_id",userId);if(membershipId)await provider.from("staff_memberships").delete().eq("id",membershipId);await provider.auth.admin.deleteUser(userId)}
  console.log("RESTORED: disposable Apps & Access owner removed")
}
if(failed)process.exitCode=1
