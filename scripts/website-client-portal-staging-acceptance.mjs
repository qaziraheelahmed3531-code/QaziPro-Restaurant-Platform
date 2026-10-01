import assert from "node:assert/strict"
import { randomUUID } from "node:crypto"
import { createClient } from "@supabase/supabase-js"
import { chromium, expect } from "playwright/test"
import sharp from "sharp"
import { mkdir, writeFile } from "node:fs/promises"

const ref=process.env.STAGING_SUPABASE_PROJECT_REF
const url=process.env.STAGING_SUPABASE_URL
const publicKey=process.env.STAGING_SUPABASE_PUBLISHABLE_KEY
const serviceKey=process.env.STAGING_SUPABASE_SERVICE_ROLE_KEY
const base=(process.env.STAGING_WEBSITE_URL||"http://localhost:3103").replace(/\/$/,"")
const adminBase=process.env.STAGING_SUPER_ADMIN_URL||"http://localhost:3102"
assert.ok(['localhost','127.0.0.1'].includes(new URL(adminBase).hostname),"Super Admin acceptance must run locally against staging")
if(process.env.ALLOW_STAGING_ACCEPTANCE!=="1"||process.env.STAGING_ENVIRONMENT!=="staging"||ref!=="jzisqjvroxodvmqxzsob"||!url||!publicKey||!serviceKey||!['localhost','127.0.0.1'].includes(new URL(base).hostname))throw new Error("Refusing client portal acceptance outside the verified local/staging boundary.")

const service=createClient(url,serviceKey,{auth:{persistSession:false,autoRefreshToken:false}})
const runId=randomUUID(),email=`portal-${runId}@staging.qazipro.invalid`,otherEmail=`portal-other-${runId}@staging.qazipro.invalid`
const submissionIds=[],userIds=[]
let browser,checks=0
const pass=(condition,label)=>{checks++;assert.ok(condition,label);console.log(`PASS ${checks}: ${label}`)}
const checked=(result,label)=>{if(result.error)throw new Error(`${label}: ${result.error.message}`);return result.data}

async function signature(){return sharp({create:{width:560,height:150,channels:4,background:"white"}}).composite([{input:Buffer.from('<svg width="560" height="150"><path d="M30 105 C120 20 190 140 275 66 S420 125 530 34" fill="none" stroke="#21142b" stroke-width="8" stroke-linecap="round"/></svg>')}]).png().toBuffer()}
async function submit(targetEmail,suffix){
  const body={requestKey:randomUUID(),values:{restaurantName:`Portal Acceptance ${suffix}`,locations:"2",contactName:"Staging Client",designation:"Owner",phone:"+92 300 0000000",email:targetEmail,address:"Disposable staging fixture",city:"Islamabad"},serviceIds:["pos","kds"],packageId:"custom",signature:`data:image/png;base64,${(await signature()).toString("base64")}`,consent:true,website:"",startedAt:Date.now()-4000}
  const response=await fetch(`${base}/api/client-onboarding`,{method:"POST",headers:{"content-type":"application/json",origin:base,"x-forwarded-for":`198.51.${Number(suffix)}.${Math.floor(Math.random()*190)+20}`},body:JSON.stringify(body)})
  const payload=await response.json();if(response.status!==201)throw new Error(`Fixture submission failed (${response.status}: ${payload.message||"unknown"}).`)
  const row=checked(await service.from("platform_onboarding_submissions").select("id,reference").eq("reference",payload.reference).single(),"load fixture")
  submissionIds.push(row.id);return row
}

try{
  // Only this run's uniquely identified fixtures are removed in finally.
  const own=await submit(email,"41")
  const other=await submit(otherEmail,"42")
  checked(await service.from("platform_onboarding_submissions").update({internal_notes:"PRIVATE-PORTAL-ACCEPTANCE-MARKER"}).eq("id",own.id),"set private marker")
  browser=await chromium.launch({headless:true,channel:"chrome"});const context=await browser.newContext({viewport:{width:390,height:844},extraHTTPHeaders:{"x-forwarded-for":`203.0.113.${Math.floor(Math.random()*190)+20}`}});const page=await context.newPage();const errors=[]
  page.on("pageerror",error=>errors.push(error.message));page.on("console",message=>{if(message.type()==="error")errors.push(message.text())})
  await page.goto(`${base}/client-portal?reference=${own.reference}&email=${encodeURIComponent(email)}`,{waitUntil:"networkidle"})
  await expect(page.getByRole("heading",{name:"Your QaziPro application."})).toBeVisible();pass(true,"passwordless client portal rendered at mobile viewport")
  await page.getByRole("button",{name:"Email my sign-in code"}).click();await expect(page.getByRole("heading",{name:"Check your inbox."})).toBeVisible({timeout:20000});pass(true,"real OTP request accepted without exposing account existence")
  const generated=checked(await service.auth.admin.generateLink({type:"magiclink",email}),"generate disposable OTP");const token=generated.properties.email_otp;userIds.push(generated.user.id);pass(/^\d{8}$/.test(token),"provider issued the configured real 8-digit OTP")
  await page.locator('.portal-otp input').first().fill(token);await page.getByRole("button",{name:"Open Client Portal"}).click();await page.waitForURL(new RegExp(`/client-portal/${own.reference}$`));await expect(page.getByRole("heading",{name:"Selected scope"})).toBeVisible();pass(true,"verified OTP created a restored SSR portal session and opened the requested application")
  pass(!(await page.locator("body").innerText()).includes("PRIVATE-PORTAL-ACCEPTANCE-MARKER"),"internal platform notes are excluded from the client DTO")
  await page.goto(`${base}/client-portal/${other.reference}`,{waitUntil:"networkidle"});pass((await page.getByText(/not found|could not be found/i).count())>0||page.url().includes("_not-found"),"verified client cannot open another application")
  const adminEmail=`portal-admin-${runId}@staging.qazipro.invalid`,password=`Qa!${randomUUID()}a9`
  const adminUser=checked(await service.auth.admin.createUser({email:adminEmail,password,email_confirm:true}),"create scoped platform QA user").user
  userIds.push(adminUser.id)
  const role=checked(await service.from("platform_roles").select("id").eq("key","PLATFORM_OWNER").single(),"platform owner role")
  checked(await service.from("platform_staff").insert({user_id:adminUser.id,email:adminEmail,display_name:"Portal acceptance POC",status:"ACTIVE"}),"platform fixture staff")
  checked(await service.from("platform_staff_roles").insert({staff_user_id:adminUser.id,role_id:role.id}),"platform fixture role")
  const publicAuth=createClient(url,publicKey,{auth:{persistSession:false,autoRefreshToken:false}})
  const adminSession=checked(await publicAuth.auth.signInWithPassword({email:adminEmail,password}),"platform QA login").session
  const adminContext=await browser.newContext({viewport:{width:1440,height:900}})
  const cookie=`base64-${Buffer.from(JSON.stringify(adminSession)).toString("base64url")}`,parts=cookie.match(/.{1,3000}/g)
  await adminContext.addCookies(parts.map((value,index)=>({name:parts.length===1?"qazipro-platform-auth":`qazipro-platform-auth.${index}`,value,url:adminBase,sameSite:"Lax"})))
  const adminPage=await adminContext.newPage()
  await adminPage.goto(`${adminBase}/website/submissions/${own.id}`,{waitUntil:"domcontentloaded",timeout:90000})
  await expect(adminPage.getByRole("heading",{name:own.reference})).toBeVisible()
  await adminPage.locator('select[name="status"]').selectOption("REVIEWING")
  await adminPage.locator('select[name="assigned"]').selectOption(adminUser.id)
  await adminPage.getByRole("button",{name:"Save internal update"}).click()
  await expect.poll(async()=>{const row=(await service.from("platform_onboarding_submissions").select("status,assigned_staff_user_id").eq("id",own.id).single()).data;return row?.status==="REVIEWING"&&row.assigned_staff_user_id===adminUser.id}).toBe(true)
  pass(true,"Super Admin submission detail, status update and POC assignment persisted through UI")
  const agreement=await adminPage.request.get(`${adminBase}/website/submissions/${own.id}/pdf`)
  const agreementBytes=await agreement.body()
  pass(agreement.ok()&&agreementBytes.subarray(0,5).toString()==="%PDF-","Super Admin can download actual generated signed agreement PDF")
  await mkdir("artifacts/website-deep-recovery",{recursive:true})
  await writeFile("artifacts/website-deep-recovery/agreement-acceptance.pdf",agreementBytes)
  await adminPage.getByRole("textbox",{name:"Client-visible request",exact:true}).fill("Please confirm the preferred launch date.")
  await adminPage.getByRole("button",{name:"Request information",exact:true}).click()
  await expect.poll(async()=>Number((await service.from("platform_onboarding_portal_messages").select("id",{count:"exact",head:true}).eq("submission_id",own.id).eq("message_type","REQUEST_INFO")).count)).toBe(1)
  await page.goto(`${base}/client-portal/${own.reference}`,{waitUntil:"networkidle"});await expect(page.getByText("Please confirm the preferred launch date.")).toBeVisible();pass(true,"platform information request is visible to the correct client")
  await page.locator('.portal-message-form textarea').fill("Preferred launch date is 15 November.");await page.getByRole("button",{name:"Send response"}).click();await expect(page.getByText("Preferred launch date is 15 November.")).toBeVisible({timeout:20000});const responseRow=checked(await service.from("platform_onboarding_portal_messages").select("sender_kind,message_type").eq("submission_id",own.id).eq("body","Preferred launch date is 15 November.").single(),"read client response");pass(responseRow.sender_kind==="CLIENT"&&responseRow.message_type==="CLIENT_RESPONSE","client response reached the canonical Super Admin conversation")
  await adminPage.reload({waitUntil:"networkidle"});await expect(adminPage.getByText("Preferred launch date is 15 November.")).toBeVisible();pass(true,"client reply appears in actual Super Admin detail after reload")
  const pdf=agreementBytes
  await page.locator('.portal-upload-form input[type="file"]').setInputFiles({name:"launch-details.pdf",mimeType:"application/pdf",buffer:pdf});await page.getByRole("button",{name:"Upload document"}).click();await expect(page.getByText("Document uploaded securely.")).toBeVisible({timeout:20000});await page.reload({waitUntil:"networkidle"});await expect(page.getByText("launch-details.pdf")).toBeVisible({timeout:20000});const link=page.getByRole("link",{name:/launch-details\.pdf/});const href=await link.getAttribute("href");const download=await page.request.get(new URL(href,base).toString());pass(download.ok()&&(await download.body()).subarray(0,5).toString()==="%PDF-","authenticated client upload and protected download both work")
  await page.getByRole("button",{name:"Sign out"}).click();await page.waitForURL(/\/client-portal$/);pass(true,"portal logout clears the secure session")
  pass(errors.length===0,`browser console errors: ${errors.join("; ")}`)
  console.log(JSON.stringify({ok:true,checks,portal:"PASS",otp:"PASS",isolation:"PASS",messages:"PASS",documents:"PASS",privateData:"PASS"}))
}finally{
  if(browser)await browser.close()
  for(const id of submissionIds)await service.from("platform_onboarding_submissions").delete().eq("id",id)
  await service.from("platform_onboarding_submissions").delete().in("portal_email",[email,otherEmail])
  for(const id of [...new Set(userIds)])await service.auth.admin.deleteUser(id)
}
