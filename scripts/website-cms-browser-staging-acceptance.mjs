import assert from "node:assert/strict"
import { randomBytes,randomUUID } from "node:crypto"
import { createClient } from "@supabase/supabase-js"
import { chromium,expect } from "playwright/test"
import { resolve } from "node:path"

const ref=process.env.STAGING_SUPABASE_PROJECT_REF,url=process.env.STAGING_SUPABASE_URL,publicKey=process.env.STAGING_SUPABASE_PUBLISHABLE_KEY,serviceKey=process.env.STAGING_SUPABASE_SERVICE_ROLE_KEY
const appUrl=process.env.STAGING_SUPER_ADMIN_URL,publicSite="https://www.qazipro.com"
if(process.env.ALLOW_STAGING_ACCEPTANCE!=="1"||process.env.STAGING_ENVIRONMENT!=="staging"||ref!=="jzisqjvroxodvmqxzsob"||!url||!publicKey||!serviceKey||!/super-admin-[a-z0-9]+\.vercel\.app$/i.test(new URL(appUrl).hostname))throw new Error("Refusing CMS browser acceptance outside verified staging resources.")
const service=createClient(url,serviceKey,{auth:{persistSession:false,autoRefreshToken:false}})
const email=`website-cms-${randomUUID()}@staging.qazipro.invalid`,password=`${randomBytes(18).toString("base64url")}A1!`,teamName=`CMS QA ${Date.now()}`
let userId,unauthorizedId,teamId,browser,originalForm
let checks=0
const pass=(condition,label)=>{checks++;assert.ok(condition,label);console.log(`PASS ${checks}: ${label}`)}
const checked=(result,label)=>{if(result.error)throw new Error(`${label}: ${result.error.message}`);return result.data}
const cookies=session=>{const value=`base64-${Buffer.from(JSON.stringify(session)).toString("base64url")}`,pieces=value.match(/.{1,3000}/g)??[];return pieces.map((part,index)=>({name:pieces.length===1?"qazipro-platform-auth":`qazipro-platform-auth.${index}`,value:part,url:appUrl,sameSite:"Lax"}))}

try{
  const created=checked(await service.auth.admin.createUser({email,password,email_confirm:true}),"create owner");userId=created.user.id
  const role=checked(await service.from("platform_roles").select("id").eq("key","PLATFORM_OWNER").single(),"owner role")
  checked(await service.from("platform_staff").insert({user_id:userId,email,display_name:"Website CMS QA",status:"ACTIVE"}),"owner staff")
  checked(await service.from("platform_staff_roles").insert({staff_user_id:userId,role_id:role.id}),"owner grant")
  const client=createClient(url,publicKey,{auth:{persistSession:false,autoRefreshToken:false}}),signed=checked(await client.auth.signInWithPassword({email,password}),"owner session")
  originalForm=checked(await service.from("platform_onboarding_forms").select("id,draft_definition,draft_revision").eq("slug","client-onboarding").single(),"form snapshot")
  browser=await chromium.launch({headless:true,channel:"chrome"});const context=await browser.newContext({viewport:{width:1440,height:900}});await context.addCookies(cookies(signed.session));const page=await context.newPage();const errors=[];page.on("pageerror",error=>errors.push(error.message));page.on("console",message=>{if(message.type()==="error")errors.push(message.text())})
  await page.goto(`${appUrl}/website`,{waitUntil:"networkidle"});await expect(page.getByRole("heading",{name:"QaziPro Website"})).toBeVisible();pass(true,"authorized owner opened Website CMS")
  pass(await page.locator(".cms-document").count()>=4,"Home/About/Footer/SEO editors rendered")
  pass(await page.getByText("LIVE DRAFT PREVIEW").first().isVisible(),"content live draft preview rendered")
  const create=page.locator("details.inline-create");await create.locator("summary").click();await create.locator('[name="name"]').fill(teamName);await create.locator('[name="title"]').fill("Acceptance Tester");await create.locator('[name="shortBio"]').fill("Disposable staging team profile used to verify safe CMS publishing.");await create.getByRole("button",{name:"Save team draft"}).click()
  await expect.poll(async()=>{const result=await service.from("platform_site_team_members").select("id").eq("name",teamName).maybeSingle();teamId=result.data?.id;return Boolean(teamId)}).toBe(true);pass(true,"team draft created through server action")
  await page.reload({waitUntil:"networkidle"});const card=page.locator(".team-manager-card").filter({hasText:teamName});const edit=card.locator("details");await edit.locator("summary").click();await edit.locator('[name="displayOrder"]').fill("7");await edit.getByRole("button",{name:"Save team draft"}).click();await expect.poll(async()=>Number((await service.from("platform_site_team_members").select("display_order").eq("id",teamId).single()).data?.display_order)===7).toBe(true);pass(true,"team display order updated")
  await card.locator('input[name="image"]').setInputFiles(resolve("qazipro-website/public/brand/qazipro-mark-clean.png"));await card.getByRole("button",{name:"Upload"}).click();await expect.poll(async()=>Boolean((await service.from("platform_site_team_members").select("image_path").eq("id",teamId).single()).data?.image_path),{timeout:30000}).toBe(true);pass(true,"team image uploaded and attached")
  await card.getByRole("button",{name:"Publish profile"}).click();await expect.poll(async()=>Boolean((await service.from("platform_site_team_members").select("published_snapshot").eq("id",teamId).single()).data?.published_snapshot)).toBe(true);pass(true,"team profile published")
  await expect.poll(async()=>{const response=await fetch(`${publicSite}/about`,{cache:"no-store"});return (await response.text()).includes(teamName)},{timeout:70000}).toBe(true);pass(true,"published team reached public About without deployment")
  const firstSection=page.locator(".builder-section").first();await firstSection.getByRole("button",{name:"Add"}).click();await firstSection.getByLabel("Section title").last().fill("Acceptance preview section");await page.getByRole("button",{name:"Save form draft"}).click();await expect.poll(async()=>Number((await service.from("platform_onboarding_forms").select("draft_revision").eq("id",originalForm.id).single()).data?.draft_revision)>Number(originalForm.draft_revision)).toBe(true);pass(true,"form section builder saved a versioned draft")
  await page.goto(`${appUrl}/website?status=NEW&q=not-a-real-reference#submissions`,{waitUntil:"networkidle"});pass(await page.getByRole("heading",{name:"Client onboarding submissions"}).isVisible(),"submission search/status filters rendered")
  await page.goto(`${appUrl}/website#team`,{waitUntil:"networkidle"});const deleteCard=page.locator(".team-manager-card").filter({hasText:teamName});await deleteCard.getByRole("button",{name:"Delete"}).click();const dialog=page.getByRole("dialog",{name:"Confirm change"});await dialog.getByRole("button",{name:"Confirm change"}).click();await expect.poll(async()=>!(await service.from("platform_site_team_members").select("id").eq("id",teamId).maybeSingle()).data).toBe(true);teamId=null;pass(true,"confirmed team deletion removed the fixture")
  await expect.poll(async()=>{const response=await fetch(`${publicSite}/about`,{cache:"no-store"});return !(await response.text()).includes(teamName)},{timeout:70000}).toBe(true);pass(true,"deleted profile disappeared from public About")
  const anonymous=checked(await service.auth.admin.createUser({email:`website-denied-${randomUUID()}@staging.qazipro.invalid`,password,email_confirm:true}),"create unauthorized");unauthorizedId=anonymous.user.id;const deniedClient=createClient(url,publicKey,{auth:{persistSession:false,autoRefreshToken:false}}),deniedSession=checked(await deniedClient.auth.signInWithPassword({email:anonymous.user.email,password}),"unauthorized session");const deniedContext=await browser.newContext();await deniedContext.addCookies(cookies(deniedSession.session));const deniedPage=await deniedContext.newPage();await deniedPage.goto(`${appUrl}/website`,{waitUntil:"networkidle"});const deniedPath=new URL(deniedPage.url()).pathname,deniedBody=await deniedPage.locator("body").innerText();pass(!deniedBody.includes("Draft, preview and publish QaziPro.com")&&(deniedPath!=="/website"||/access denied|sign in|continue with google|work email/i.test(deniedBody)),"non-platform user denied Website CMS");await deniedContext.close()
  pass(errors.length===0,`browser console errors: ${errors.join("; ")}`)
  console.log(JSON.stringify({ok:true,checks,appUrl,publicSite,teamCrud:"PASS",cacheInvalidation:"PASS",sectionBuilder:"PASS",rbac:"PASS"}))
}finally{
  if(originalForm)await service.from("platform_onboarding_forms").update({draft_definition:originalForm.draft_definition,draft_revision:originalForm.draft_revision}).eq("id",originalForm.id)
  if(teamId)await service.from("platform_site_team_members").delete().eq("id",teamId)
  if(browser)await browser.close()
  if(userId)await service.auth.admin.deleteUser(userId)
  if(unauthorizedId)await service.auth.admin.deleteUser(unauthorizedId)
}
