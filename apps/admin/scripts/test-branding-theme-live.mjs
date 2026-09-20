import assert from "node:assert/strict"
import { randomUUID } from "node:crypto"
import { chromium } from "playwright"
import { createClient } from "@supabase/supabase-js"
import { createServerClient } from "@supabase/ssr"

process.loadEnvFile(new URL("../../backend/.env.local",import.meta.url))
const env=process.env
const db=createClient(env.NEXT_PUBLIC_SUPABASE_URL,env.SUPABASE_SERVICE_ROLE_KEY,{auth:{persistSession:false,autoRefreshToken:false}})
const publicDb=createClient(env.NEXT_PUBLIC_SUPABASE_URL,env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY,{auth:{persistSession:false,autoRefreshToken:false}})
const check=(result,label)=>{if(result.error)throw new Error(`${label}: ${result.error.message}`);return result.data}
const browser=await chromium.launch({channel:"chrome",headless:true})
const report={}
const adminOrigin=process.argv[2]??"http://localhost:3001"
const customerOrigin=process.argv[3]??"http://localhost:3000"
let ownerId
let original
let businessId
const categoryIds=[]

try {
  const branch=check(await db.from("branches").select("id,business_id,location_revision,city").eq("is_active",true).order("sort_order").limit(1).single(),"active branch")
  businessId=branch.business_id
  original=check(await db.from("business_branding").select("*").eq("business_id",businessId).single(),"branding")
  const publicBranding=check(await publicDb.from("business_branding").select("business_id,primary_color,header_logo_size_px").eq("business_id",businessId).single(),"public branding read")
  assert.equal(publicBranding.business_id,businessId)
  const anonymousWrite=await publicDb.from("business_branding").update({header_logo_size_px:original.header_logo_size_px===120?118:120}).eq("business_id",businessId).select("business_id")
  assert.equal(anonymousWrite.error,null)
  assert.equal(anonymousWrite.data?.length,0)
  assert.equal(check(await db.from("business_branding").select("header_logo_size_px").eq("business_id",businessId).single(),"RLS verification").header_logo_size_px,original.header_logo_size_px)
  report.publicReadAndWriteRls="PASS"
  const changedPrimary=String(original.primary_color).toLowerCase()==="#19c37d"?"#ffc800":"#19c37d"
  const changedHeaderSize=original.header_logo_size_px>=120?118:original.header_logo_size_px+2
  const changedFooterSize=original.footer_logo_size_px>=180?178:original.footer_logo_size_px+2
  const qaSlug=`qa-optional-${randomUUID()}`
  const qaBoldSlug=`qa-bold-${randomUUID()}`
  const qaCategories=check(await db.from("categories").insert([
    {business_id:businessId,slug:qaSlug,name:"QA Optional Section",description:"",description_bold:false,image_url:null,section_banner_url:null,is_active:true,sort_order:9001},
    {business_id:businessId,slug:qaBoldSlug,name:"QA Bold Section",description:"This optional description is bold.",description_bold:true,image_url:null,section_banner_url:null,is_active:true,sort_order:9002},
  ]).select("id,slug"),"temporary optional categories")
  categoryIds.push(...qaCategories.map(row=>row.id))

  const email=`qa-branding-${randomUUID()}@example.test`,password=`Qa!${randomUUID()}a9`
  ownerId=check(await db.auth.admin.createUser({email,password,email_confirm:true}),"owner").user.id
  check(await db.from("staff_memberships").insert({business_id:businessId,user_id:ownerId,role:"OWNER",is_active:true}),"membership")
  const jar=new Map(),auth=createServerClient(env.NEXT_PUBLIC_SUPABASE_URL,env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY,{cookieOptions:{name:"italian-pizza-admin-auth",path:"/",sameSite:"lax"},cookies:{getAll:()=>[...jar].map(([name,value])=>({name,value})),setAll:items=>items.forEach(({name,value})=>jar.set(name,value))}})
  check(await auth.auth.signInWithPassword({email,password}),"sign in")
  const adminContext=await browser.newContext({viewport:{width:1440,height:950}})
  await adminContext.addCookies([...jar].map(([name,value])=>({name,value,domain:"localhost",path:"/",sameSite:"Lax"})))
  await adminContext.addCookies([{name:"ip-admin-branch",value:branch.id,domain:"localhost",path:"/",sameSite:"Lax"}])
  const admin=await adminContext.newPage(),adminErrors=[]
  admin.on("pageerror",error=>adminErrors.push(error.message))
  await admin.goto(`${adminOrigin}/appearance`,{waitUntil:"domcontentloaded",timeout:120000})
  await admin.getByRole("heading",{name:"Branding",exact:true}).waitFor()
  await admin.waitForTimeout(800)
  assert.equal(await admin.locator("[data-nextjs-dialog]").count(),0)
  await admin.getByLabel("Primary / buttons hex value").fill(changedPrimary)
  await admin.getByText("Header logo size").locator("..").locator("input[type=range]").fill(String(changedHeaderSize))
  await admin.getByText("Footer logo size").locator("..").locator("input[type=range]").fill(String(changedFooterSize))
  await admin.getByText("Font preset").locator("..").locator("select").selectOption("Poppins")
  await admin.waitForFunction(()=>!document.querySelector(".page-heading button")?.hasAttribute("disabled"),null,{timeout:10000})
  await admin.getByRole("button",{name:"Save & publish"}).click()
  await admin.getByText("Branding published to Admin and website.").waitFor({timeout:30000})
  const saved=check(await db.from("business_branding").select("primary_color,header_logo_size_px,footer_logo_size_px,font_family,font_stylesheet_url").eq("business_id",businessId).single(),"saved branding")
  assert.equal(saved.primary_color.toLowerCase(),changedPrimary)
  assert.equal(saved.header_logo_size_px,changedHeaderSize)
  assert.equal(saved.footer_logo_size_px,changedFooterSize)
  assert.equal(saved.font_family,"Poppins")
  assert.match(saved.font_stylesheet_url,/fonts\.googleapis\.com/)
  await admin.waitForFunction(value=>getComputedStyle(document.querySelector(".admin-shell")).getPropertyValue("--brand").trim().toLowerCase()===value,changedPrimary)
  if(original.favicon_url) {
    assert.equal(await admin.locator(".admin-brand__logo img").count(),1)
    const previewFit=await admin.locator(".media-preview--contain img").first().evaluate(node=>getComputedStyle(node).objectFit)
    assert.equal(previewFit,"contain")
    const previewBounds=await admin.locator(".branding-logo-preview").first().evaluate(node=>{const frame=node.getBoundingClientRect(),image=node.querySelector("img")?.getBoundingClientRect();return {frame:{left:frame.left,top:frame.top,right:frame.right,bottom:frame.bottom},image:image?{left:image.left,top:image.top,right:image.right,bottom:image.bottom}:null}})
    assert.ok(previewBounds.image)
    assert.ok(previewBounds.image.left>=previewBounds.frame.left&&previewBounds.image.top>=previewBounds.frame.top&&previewBounds.image.right<=previewBounds.frame.right&&previewBounds.image.bottom<=previewBounds.frame.bottom)
  }
  report.adminLogoAndTheme="PASS"
  assert.deepEqual(adminErrors,[])

  await admin.goto(`${adminOrigin}/banners`,{waitUntil:"domcontentloaded",timeout:120000})
  await admin.getByRole("heading",{name:"Hero slider settings"}).waitFor()
  const autoplayToggle=admin.locator(".hero-toggle input[type=checkbox]")
  if(!await autoplayToggle.isChecked()) await autoplayToggle.check()
  await admin.getByText("Change slide every").locator(".." ).locator("input[type=number]").fill("3")
  await admin.getByText("Transition speed").locator(".." ).locator("select").selectOption("Smooth")
  await admin.getByRole("button",{name:"Save slider settings"}).click()
  await admin.getByText("Slider settings published.").waitFor()
  const savedHero=check(await db.from("business_branding").select("hero_autoplay,hero_interval_ms,hero_transition_ms").eq("business_id",businessId).single(),"saved hero settings")
  assert.deepEqual(savedHero,{hero_autoplay:true,hero_interval_ms:3000,hero_transition_ms:650})
  report.heroAdminSettings="PASS"
  const customerContext=await browser.newContext({viewport:{width:1280,height:850},reducedMotion:"no-preference"})
  await customerContext.addInitScript(({branchId,revision,city})=>localStorage.setItem("italian-pizza-demo-state-v2",JSON.stringify({cart:[],orderType:"pickup",selectedAreaId:null,locationSource:"MANUAL_AREA",coordinates:null,deliveryQuote:null,promoCode:"",promoDiscount:0,branchId,city,locationRevision:revision})),{branchId:branch.id,revision:branch.location_revision,city:branch.city})
  const customer=await customerContext.newPage(),customerErrors=[]
  customer.on("pageerror",error=>customerErrors.push(error.message))
  await customer.goto(customerOrigin,{waitUntil:"domcontentloaded",timeout:120000})
  await customer.locator(".hero-carousel").waitFor()
  const theme=await customer.locator("body").evaluate(node=>{const style=getComputedStyle(node);return {primary:style.getPropertyValue("--ip-brand-primary").trim(),page:style.getPropertyValue("--ip-background-default").trim(),header:style.getPropertyValue("--ip-header-background").trim(),footer:style.getPropertyValue("--ip-footer-background").trim(),card:style.getPropertyValue("--ip-product-card-background").trim(),text:style.getPropertyValue("--ip-text-primary").trim(),footerText:style.getPropertyValue("--ip-footer-text").trim(),headerSize:style.getPropertyValue("--ip-header-logo-size").trim(),footerSize:style.getPropertyValue("--ip-footer-logo-size").trim()}})
  assert.deepEqual(theme,{primary:changedPrimary,page:original.website_background_color,header:original.header_background_color,footer:original.footer_background_color,card:original.product_card_background_color,text:original.text_color,footerText:original.footer_text_color,headerSize:`${changedHeaderSize}px`,footerSize:`${changedFooterSize}px`})
  const exactBrandColors=await customer.evaluate(()=>{const color=selector=>{const node=document.querySelector(selector);return node?getComputedStyle(node).color:null},background=selector=>{const node=document.querySelector(selector);return node?getComputedStyle(node).backgroundColor:null},border=selector=>{const node=document.querySelector(selector);return node?getComputedStyle(node).borderBottomColor:null};return {primary:getComputedStyle(document.body).getPropertyValue("--ip-brand-primary").trim(),announcement:background(".announcement"),activeCategoryText:color(".sticky-category-rail button[aria-current=true]"),activeCategoryBorder:border(".sticky-category-rail button[aria-current=true]")}})
  const expectedRgb=await customer.evaluate(hex=>{const node=document.createElement("i");node.style.color=hex;document.body.append(node);const value=getComputedStyle(node).color;node.remove();return value},changedPrimary)
  assert.deepEqual(exactBrandColors,{primary:changedPrimary,announcement:expectedRgb,activeCategoryText:expectedRgb,activeCategoryBorder:expectedRgb})
  report.exactSelectedPrimaryAcrossStorefront="PASS"
  const rendered=await customer.evaluate(()=>{const box=selector=>{const node=document.querySelector(selector);if(!node)return null;const value=node.getBoundingClientRect();return {left:value.left,top:value.top,right:value.right,bottom:value.bottom,width:value.width,height:value.height}};const header=document.querySelector(".site-header"),footer=document.querySelector(".site-footer"),card=document.querySelector(".product-card"),badge=document.querySelector(".product-badge");return {header:box(".site-header"),headerLogo:box(".brand-logo--header .brand-logo__image"),headerImage:box(".brand-logo--header img"),footerLogo:box(".brand-logo--footer .brand-logo__image"),footerImage:box(".brand-logo--footer img"),headerBackground:header?getComputedStyle(header).backgroundColor:null,footerBackground:footer?getComputedStyle(footer).backgroundColor:null,cardBackground:card?getComputedStyle(card).backgroundColor:null,badgeBackground:badge?getComputedStyle(badge).backgroundColor:null}})
  assert.equal(rendered.headerLogo.height,changedHeaderSize)
  assert.equal(rendered.footerLogo.height,changedFooterSize)
  assert.ok(rendered.headerLogo.width>rendered.headerLogo.height&&rendered.footerLogo.width>rendered.footerLogo.height)
  for(const [frame,image] of [[rendered.headerLogo,rendered.headerImage],[rendered.footerLogo,rendered.footerImage]]) assert.ok(image.left>=frame.left&&image.top>=frame.top&&image.right<=frame.right&&image.bottom<=frame.bottom)
  assert.ok(rendered.headerImage.top>=rendered.header.top&&rendered.headerImage.bottom<=rendered.header.bottom)
  assert.equal(await customer.locator(".brand-logo--header .brand-logo__image").evaluate(node=>getComputedStyle(node).overflow),"hidden")
  assert.equal(await customer.locator(".brand-logo--footer .brand-logo__image").evaluate(node=>getComputedStyle(node).overflow),"hidden")
  const expectedFooterRgb=await customer.evaluate(hex=>{const node=document.createElement("i");node.style.color=hex;document.body.append(node);const value=getComputedStyle(node).color;node.remove();return value},original.footer_background_color)
  const expectedSecondaryRgb=await customer.evaluate(hex=>{const node=document.createElement("i");node.style.color=hex;document.body.append(node);const value=getComputedStyle(node).color;node.remove();return value},original.secondary_color)
  assert.equal(rendered.footerBackground,expectedFooterRgb)
  assert.equal(rendered.badgeBackground,expectedSecondaryRgb)
  assert.ok(rendered.headerBackground&&rendered.cardBackground)
  report.exactFooterAndBadgeColors="PASS"
  if(original.favicon_url){const adminIcon=await admin.locator(".admin-brand__logo img").getAttribute("src");assert.equal(adminIcon,original.favicon_url);const tabIcon=await admin.locator('link[rel~="icon"]').last().getAttribute("href");assert.equal(tabIcon,original.favicon_url)}
  const heroRuntime=await customer.locator(".hero-carousel").evaluate(node=>({index:node.getAttribute("data-active-index"),autoplay:node.getAttribute("data-autoplay"),interval:node.getAttribute("data-interval-ms"),hidden:document.hidden,visibility:document.visibilityState}))
  const prompt=customer.locator(".menu-search-placeholder [data-product-prompt]")
  await prompt.waitFor()
  await customer.waitForFunction(()=>document.querySelector(".menu-search-placeholder")?.textContent?.startsWith("Search for "))
  const promptName=await prompt.getAttribute("data-product-prompt")
  assert.ok(promptName&&await customer.getByText(promptName,{exact:true}).count()>0)
  const promptText=await prompt.textContent();await customer.waitForTimeout(350);assert.notEqual(await prompt.textContent(),promptText)
  const promptCount=Number(await prompt.getAttribute("data-product-prompt-count"));assert.ok(promptCount>0)
  const observedPromptIndexes=await customer.evaluate(async ({expected,timeout})=>new Promise(resolve=>{const found=new Set(),node=document.querySelector("[data-product-prompt-index]");if(!node){resolve([]);return}const collect=()=>found.add(node.getAttribute("data-product-prompt-index"));collect();const observer=new MutationObserver(()=>{collect();if(found.size===expected){observer.disconnect();resolve([...found])}});observer.observe(node,{attributes:true,attributeFilter:["data-product-prompt-index"]});setTimeout(()=>{observer.disconnect();resolve([...found])},timeout)}),{expected:promptCount,timeout:Math.max(6000,promptCount*4300)})
  assert.equal(observedPromptIndexes.length,promptCount,`Every product/deal must appear in the search prompt sequence: ${JSON.stringify(observedPromptIndexes)}`)
  report.fullProductSearchTypeEraseSequence="PASS"
  const optionalSection=customer.locator(`#${qaSlug}`),boldSection=customer.locator(`#${qaBoldSlug}`)
  await optionalSection.waitFor();await boldSection.waitFor()
  assert.equal(await optionalSection.locator(".category-banner").count(),0)
  assert.equal(await optionalSection.locator(".menu-section-heading p").count(),0)
  assert.equal(await boldSection.locator(".category-banner").count(),0)
  assert.ok(Number(await boldSection.locator(".menu-section-heading p").evaluate(node=>getComputedStyle(node).fontWeight))>=700)
  assert.match(await customer.locator("body").evaluate(node=>getComputedStyle(node).fontFamily),/Poppins/i)
  report.optionalSectionPresentationAndFont="PASS"
  const hero=customer.locator(".hero-carousel"),hoverBox=await hero.boundingBox()
  assert.ok(hoverBox)
  await customer.mouse.move(hoverBox.x+hoverBox.width*.5,hoverBox.y+hoverBox.height*.5)
  const first=await customer.locator(".hero-dots button[aria-current=true]").getAttribute("aria-label")
  await customer.waitForFunction(previous=>document.querySelector(".hero-dots button[aria-current=true]")?.getAttribute("aria-label")!==previous,first,{timeout:6500})
  const second=await customer.locator(".hero-dots button[aria-current=true]").getAttribute("aria-label")
  assert.notEqual(second,first,`hero must autoplay: ${JSON.stringify(heroRuntime)}`)
  const box=await hero.boundingBox(),beforeDrag=await hero.getAttribute("data-active-index")
  assert.ok(box)
  await customer.mouse.move(box.x+box.width*.75,box.y+box.height*.5);await customer.mouse.down();await customer.mouse.move(box.x+box.width*.25,box.y+box.height*.5,{steps:12});await customer.mouse.up()
  await customer.waitForFunction(previous=>document.querySelector(".hero-carousel")?.getAttribute("data-active-index")!==previous,beforeDrag)
  assert.ok((await customer.locator(".hero-slide").evaluateAll(nodes=>nodes.map(node=>getComputedStyle(node).transform))).some(value=>value!=="none"))
  const beforeKey=await hero.getAttribute("data-active-index");await hero.press("ArrowRight");await customer.waitForFunction(previous=>document.querySelector(".hero-carousel")?.getAttribute("data-active-index")!==previous,beforeKey)
  report.heroAutoplayMouseDragKeyboard="PASS"
  const locationDialog=customer.locator("dialog.location-dialog[open]");if(!await locationDialog.isVisible())await customer.locator(".desktop-location").click();await locationDialog.waitFor();const modalLogo=customer.locator(".brand-logo--location .brand-logo__image");assert.ok(await modalLogo.evaluate(node=>{const frame=node.getBoundingClientRect(),image=node.querySelector("img")?.getBoundingClientRect();return frame.height>=52&&getComputedStyle(node).overflow==="hidden"&&Boolean(image&&image.left>=frame.left&&image.top>=frame.top&&image.right<=frame.right&&image.bottom<=frame.bottom)}));report.locationLogoVisible="PASS";const closeLocation=customer.locator(".location-close");if(await closeLocation.isVisible())await closeLocation.click();else await locationDialog.getByRole("button",{name:"Start ordering"}).click()
  assert.equal(await customer.locator("[data-nextjs-dialog]").count(),0)
  assert.deepEqual(customerErrors,[])
  report.customerThemeVariables="PASS"
  report.logoFramesUnclipped="PASS"
  report.activeSlides=await customer.locator(".hero-dots button").count()
  await customerContext.close()
  const touchContext=await browser.newContext({viewport:{width:390,height:844},isMobile:true,hasTouch:true,reducedMotion:"no-preference"})
  await touchContext.addInitScript(({branchId,revision,city})=>localStorage.setItem("italian-pizza-demo-state-v2",JSON.stringify({cart:[],orderType:"pickup",selectedAreaId:null,locationSource:"MANUAL_AREA",coordinates:null,deliveryQuote:null,promoCode:"",promoDiscount:0,branchId,city,locationRevision:revision})),{branchId:branch.id,revision:branch.location_revision,city:branch.city})
  const touch=await touchContext.newPage();await touch.goto(customerOrigin,{waitUntil:"domcontentloaded",timeout:120000});const touchHero=touch.locator(".hero-carousel");await touchHero.waitFor();const touchBox=await touchHero.boundingBox(),beforeTouch=await touchHero.getAttribute("data-active-index");assert.ok(touchBox);const session=await touchContext.newCDPSession(touch);const y=touchBox.y+touchBox.height*.5,startX=touchBox.x+touchBox.width*.8,endX=touchBox.x+touchBox.width*.2;await session.send("Input.dispatchTouchEvent",{type:"touchStart",touchPoints:[{x:startX,y,id:1}]});for(let step=1;step<=10;step++)await session.send("Input.dispatchTouchEvent",{type:"touchMove",touchPoints:[{x:startX+(endX-startX)*(step/10),y,id:1}]});await session.send("Input.dispatchTouchEvent",{type:"touchEnd",touchPoints:[]});await touch.waitForFunction(previous=>document.querySelector(".hero-carousel")?.getAttribute("data-active-index")!==previous,beforeTouch);report.heroFingerSwipe="PASS";await touchContext.close()
  const reducedContext=await browser.newContext({viewport:{width:1280,height:850},reducedMotion:"reduce"})
  await reducedContext.addInitScript(({branchId,revision,city})=>localStorage.setItem("italian-pizza-demo-state-v2",JSON.stringify({cart:[],orderType:"pickup",selectedAreaId:null,locationSource:"MANUAL_AREA",coordinates:null,deliveryQuote:null,promoCode:"",promoDiscount:0,branchId,city,locationRevision:revision})),{branchId:branch.id,revision:branch.location_revision,city:branch.city})
  const reduced=await reducedContext.newPage();await reduced.goto(customerOrigin,{waitUntil:"domcontentloaded",timeout:120000});const reducedHero=reduced.locator(".hero-carousel");await reducedHero.waitFor();const reducedDots=reduced.locator(".hero-dots button"),reducedDotCount=await reducedDots.count();if(reducedDotCount>1){const reducedBefore=Number(await reducedHero.getAttribute("data-active-index"));await reducedDots.nth((reducedBefore+1)%reducedDotCount).dispatchEvent("click");await reduced.waitForFunction(previous=>document.querySelector(".hero-carousel")?.getAttribute("data-active-index")!==String(previous),reducedBefore)}assert.equal(await reducedHero.getAttribute("data-transition-ms"),"650");assert.equal(await reducedHero.getAttribute("data-autoplay"),"true");report.heroConfiguredMotionRemainsConsistent="PASS";await reducedContext.close()
  await admin.goto(`${adminOrigin}/categories`,{waitUntil:"domcontentloaded",timeout:120000})
  for(const name of ["QA Optional Section","QA Bold Section"]){const row=admin.getByRole("row").filter({hasText:name});await row.waitFor();admin.once("dialog",dialog=>dialog.accept());await row.getByRole("button",{name:"Delete"}).click();await admin.getByText("Record deleted permanently.").waitFor()}
  assert.equal(check(await db.from("categories").select("id").in("id",categoryIds),"verify category deletion").length,0)
  categoryIds.length=0
  report.realAdminDelete="PASS"
  await adminContext.close()
  console.log(JSON.stringify(report))
} finally {
  if(categoryIds.length) await db.from("categories").delete().in("id",categoryIds)
  if(original&&businessId){
    const restore=Object.fromEntries(Object.entries(original).filter(([key])=>!["business_id","created_at","updated_at"].includes(key)))
    await db.from("business_branding").update(restore).eq("business_id",businessId)
  }
  if(ownerId){await db.from("audit_logs").delete().eq("actor_id",ownerId);await db.from("staff_memberships").delete().eq("user_id",ownerId);await db.auth.admin.deleteUser(ownerId)}
  await browser.close()
}
