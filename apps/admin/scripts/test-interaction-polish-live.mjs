import assert from 'node:assert/strict'
import { randomUUID } from 'node:crypto'
import { mkdir } from 'node:fs/promises'
import { chromium } from 'playwright'
import { createClient } from '@supabase/supabase-js'
import { createServerClient } from '@supabase/ssr'

// Read-only UI checks. Only an isolated QA staff identity and local IndexedDB fixture are created.
process.loadEnvFile(new URL('../../backend/.env.local', import.meta.url))
const customerOrigin = process.env.CUSTOMER_TEST_URL || 'http://localhost:3000'
const adminOrigin = process.env.ADMIN_TEST_URL || 'http://localhost:3001'
const desktopOrigin = 'http://127.0.0.1:5174'
const sizes = [[360,800],[390,844],[768,1024],[1024,768],[1440,900],[1920,1080],[2560,1080],[844,390]]
const output = new URL('../../../docs/qa/interaction-polish/', import.meta.url)
await mkdir(output, { recursive: true })
const browser = await chromium.launch({ channel: 'chrome', headless: true })
const failures = [], report = { customer: [], admin: [], desktop: [] }
const env = process.env
const db = createClient(env.NEXT_PUBLIC_SUPABASE_URL, env.SUPABASE_SERVICE_ROLE_KEY, {auth:{persistSession:false,autoRefreshToken:false}})
const check = (r, label) => { if(r.error) throw Error(`${label}: ${r.error.message}`); return r.data }
let staffId
async function layout(page, label, root = 'html') {
  const result = await page.locator(root).evaluate(el => {
    const width = el === document.documentElement ? innerWidth : el.clientWidth
    const overflow = el.scrollWidth > width + 1
    const offenders = overflow ? [...el.querySelectorAll('*')].filter(n => {
      const box=n.getBoundingClientRect(),s=getComputedStyle(n)
      return box.width && box.right > innerWidth + 2 && s.position !== 'fixed' && !n.closest('dialog:not([open]),.admin-sidebar,.categories,.quick-flow-list,.table-wrap,.table-scroll,.category-rail,.hero-carousel')
    }).slice(0,8).map(n=>n.className) : []
    return {overflow,width,scrollWidth:el.scrollWidth,offenders}
  })
  if(result.overflow) failures.push({label,...result})
  return result
}
async function shot(page, name) { await page.screenshot({path:new URL(name+'.png',output).pathname.replace(/^\/([A-Z]:)/,'$1'),fullPage:false}) }
try {
  // Storefront: real data, no checkout submissions or business setting changes.
  const c = await browser.newContext(); const page = await c.newPage()
  page.on('pageerror', e => failures.push({label:'customer runtime',error:e.message}))
  await page.goto(customerOrigin, {waitUntil:'domcontentloaded',timeout:120000})
  const gate=page.locator('.location-dialog[open]')
  await gate.waitFor({timeout:30000})
  for (const [width,height] of sizes.slice(0,4)) { await page.setViewportSize({width,height}); await layout(page,`location ${width}`); }
  await gate.getByRole('button',{name:'Pickup',exact:true}).click()
  await gate.getByRole('button',{name:'Start ordering',exact:true}).click()
  await gate.waitFor({state:'hidden'})
  for(const [width,height] of sizes) {
    await page.setViewportSize({width,height}); await page.waitForTimeout(220)
    report.customer.push({width,height,...await layout(page,`storefront ${width}x${height}`)})
    // Sample inside the browser: automation round trips can outlast a short animation.
    const movement=await page.getByRole('button',{name:/Open cart/}).first().evaluate(button=>new Promise(resolve=>{
      const samples=[]; const start=performance.now(); button.click()
      function sample(){const drawer=document.querySelector('.cart-drawer-dialog[open] .cart-drawer');if(drawer)samples.push(drawer.getBoundingClientRect().left);if(performance.now()-start<700)requestAnimationFrame(sample);else resolve(samples)}
      requestAnimationFrame(sample)
    }))
    assert.ok(movement.length>2&&Math.max(...movement)-Math.min(...movement)>10,`cart must visibly slide in at ${width}`)
    const close=page.locator('[data-cart-close]')
    assert.ok(await close.isVisible())
    await close.click(); await page.waitForTimeout(70)
    assert.equal(await page.evaluate(()=>document.body.style.overflow),'hidden','scroll must remain locked during exit')
    await page.locator('.cart-drawer-dialog[open]').waitFor({state:'detached'})
    await page.waitForTimeout(60)
    assert.notEqual(await page.evaluate(()=>document.body.style.overflow),'hidden')
    if(width===390||width===1440) await shot(page,`customer-${width}`)
  }
  await page.setViewportSize({width:1440,height:900})
  const hero=page.locator('.hero-carousel'); await hero.scrollIntoViewIfNeeded(); await hero.focus()
  await page.waitForTimeout(800)
  const before=await hero.getAttribute('data-active-index')
  await page.keyboard.press('ArrowRight'); await page.waitForTimeout(90)
  assert.ok(await hero.locator('.hero-slide').count()<=2)
  await page.keyboard.press('ArrowRight'); await page.keyboard.press('ArrowLeft')
  await page.waitForTimeout(900)
  assert.equal(await hero.locator('.hero-slide').count(),1,'rapid controls must not stack slides')
  assert.notEqual(await hero.getAttribute('data-active-index'),before)
  await page.emulateMedia({reducedMotion:'reduce'}); await page.waitForTimeout(100)
  assert.equal(await hero.getAttribute('data-transition-ms'),'0')
  assert.equal(await hero.getAttribute('data-autoplay'),'false')
  await page.keyboard.press('ArrowLeft'); await page.waitForTimeout(100)
  assert.equal(await hero.locator('.hero-slide').count(),1)
  await page.emulateMedia({reducedMotion:'no-preference'})
  await page.getByRole('button',{name:/Open cart/}).first().evaluate(button=>{
    button.click();requestAnimationFrame(()=>document.querySelector('[data-cart-close]')?.click())
  })
  await page.waitForTimeout(650)
  assert.equal(await page.locator('.cart-drawer-dialog[open]').count(),0,'rapid open/close must release native dialog')
  for(const route of ['/cart','/checkout','/account','/orders']) {
    await page.setViewportSize({width:360,height:800}); await page.goto(customerOrigin+route,{waitUntil:'domcontentloaded',timeout:120000})
    await layout(page,`customer ${route}`)
  }
  await c.close()
  console.log('Customer: responsive routes, cart open/close, rapid hero controls and reduced motion checked')

  const branch=check(await db.from('branches').select('id,business_id').eq('is_active',true).order('sort_order').limit(1).single(),'branch')
  const email=`qa-polish-${randomUUID()}@example.test`,password=`Qa!${randomUUID()}9`
  staffId=check(await db.auth.admin.createUser({email,password,email_confirm:true}),'QA staff').user.id
  check(await db.from('staff_memberships').insert({business_id:branch.business_id,user_id:staffId,role:'OWNER',is_active:true}),'QA membership')
  check(await db.from('register_shifts').insert({business_id:branch.business_id,branch_id:branch.id,opened_by:staffId,opening_cash:0,notes:'QA layout check — no sales'}),'QA empty shift')
  const jar=new Map()
  const auth=createServerClient(env.NEXT_PUBLIC_SUPABASE_URL,env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY,{cookieOptions:{name:'italian-pizza-admin-auth',path:'/',sameSite:'lax'},cookies:{getAll:()=>[...jar].map(([name,value])=>({name,value})),setAll:items=>items.forEach(({name,value})=>jar.set(name,value))}})
  check(await auth.auth.signInWithPassword({email,password}),'QA sign in')
  const a=await browser.newContext()
  await a.addCookies([...jar].map(([name,value])=>({name,value,domain:'localhost',path:'/',sameSite:'Lax'})))
  await a.addCookies([{name:'ip-admin-branch',value:branch.id,domain:'localhost',path:'/',sameSite:'Lax'}])
  const admin=await a.newPage();admin.on('pageerror',e=>failures.push({label:'admin runtime',error:e.message}))
  for(const route of ['/','/pos','/orders','/waiter','/rider','/settings','/users','/register','/appearance','/content','/modifiers','/menu']) {
    console.log('Checking admin',route)
    await admin.goto(adminOrigin+route,{waitUntil:'domcontentloaded',timeout:120000});await admin.locator('.admin-content').waitFor({timeout:60000})
    for(const [width,height] of [[360,800],[768,1024],[1440,900]]) {
      await admin.setViewportSize({width,height});await admin.waitForTimeout(200)
      report.admin.push({route,width,...await layout(admin,`admin ${route} ${width}`)})
    }
    if(route==='/pos') {
      const deal=admin.locator('.pos-products button.is-deal').first()
      if(await deal.count()) {
        await deal.click();await admin.getByRole('button',{name:'Checkout',exact:true}).click()
        for(const [width,height] of [[390,844],[768,1024],[1440,900]]){
          await admin.setViewportSize({width,height});await admin.waitForTimeout(400)
          await layout(admin,`web POS checkout ${width}`)
          const submit=admin.locator('.pos-checkout-modal').getByRole('button',{name:/Place order/}).first()
          await submit.scrollIntoViewIfNeeded()
          const submitBox=await submit.boundingBox();assert.ok(submitBox.y>=0&&submitBox.y+submitBox.height<=height+1,`web checkout button reachable ${width}`)
          await shot(admin,`admin-checkout-${width}`)
        }
        await admin.getByRole('button',{name:'Close checkout',exact:true}).click()
      }
    }
    if(route==='/modifiers') {
      await admin.getByRole('button',{name:'Add option group',exact:true}).click()
      await admin.setViewportSize({width:390,height:844});await admin.waitForTimeout(400)
      await layout(admin,'option editor 390')
      const firstProduct=admin.locator('.linked-addon-picker button').first()
      if(await firstProduct.count()) {
        await firstProduct.click()
        assert.equal(await admin.getByRole('textbox',{name:'Option 1 name',exact:true}).getAttribute('readonly'),'')
        await admin.getByRole('button',{name:'Remove option',exact:true}).first().click()
      }
      await shot(admin,'admin-addon-editor-390')
      await admin.locator('.option-editor').getByRole('button',{name:'Close',exact:true}).click()
    }
    if(['/pos','/waiter','/rider'].includes(route)) { await admin.setViewportSize({width:390,height:844});await admin.waitForTimeout(450);await shot(admin,`admin-${route.slice(1)}-390`) }
  }
  await admin.setViewportSize({width:1440,height:900})
  await admin.getByRole('button',{name:'Collapse navigation',exact:true}).click()
  await admin.waitForTimeout(350);await layout(admin,'admin collapsed')
  await admin.setViewportSize({width:768,height:1024})
  await admin.locator('.mobile-menu-button').click();await admin.waitForTimeout(450)
  await shot(admin,'admin-tablet-navigation')
  const navLabel=await admin.locator('.admin-nav a span').first().isVisible()
  if(!navLabel) failures.push({label:'collapsed desktop navigation must restore labels on tablet'})
  await a.close();console.log('Admin: twelve routes and add-on editor at mobile/tablet/desktop sizes checked')

  // Synthetic local catalog never syncs: network status is offline for this isolated context.
  const d=await browser.newContext();await d.addInitScript(()=>Object.defineProperty(navigator,'onLine',{get:()=>false}))
  const desktop=await d.newPage();desktop.on('pageerror',e=>failures.push({label:'desktop runtime',error:e.message}))
  await desktop.goto(desktopOrigin,{waitUntil:'domcontentloaded'});await desktop.locator('.login-card').waitFor()
  await desktop.evaluate(async()=>{
    const {db}=await import('/src/db.ts')
    const date=new Date().toISOString(),id='qa-layout-branch'
    await db.catalogs.put({branchId:id,businessId:'qa-layout-business',catalogVersionId:'qa-version',branchName:'Test branch',city:'Islamabad',businessName:'Restaurant with a long display name',logoUrl:null,logoDataUrl:null,primaryColor:'#f60068',secondaryColor:'#e7a81a',replacementWindowMinutes:15,recentOrderLimit:10,desktopOrderSound:false,paymentMethods:[{id:'cash',code:'CASH',name:'Cash',kind:'CASH',requiresReference:false,sortOrder:0},{id:'wallet',code:'EASYPAISA',name:'Easypaisa',kind:'WALLET',requiresReference:false,sortOrder:1}],categories:[{id:'pizza',name:'Pizzas'},{id:'burger',name:'Burgers'}],products:Array.from({length:48},(_,i)=>({id:`p-${i}`,categoryId:'pizza',name:`Chicken Fajita Pizza ${i+1}`,sku:null,price:899,imageUrl:null,imageDataUrl:null,groups:[]})),deals:[],updatedAt:date})
    await db.shifts.put({id:'qa-shift',branchId:id,status:'OPEN',openingCash:0,openedAt:date,closedAt:null,countedCash:null,syncedAt:null})
    await db.settings.put({key:'locked',value:'false'})
  })
  await desktop.reload();await desktop.locator('.premium-pos').waitFor()
  await desktop.locator('.search input').fill('Pizza 1');await desktop.locator('.product').first().click()
  for(const [width,height] of sizes) {
    await desktop.setViewportSize({width,height});await desktop.waitForTimeout(250)
    report.desktop.push({width,height,...await layout(desktop,`desktop ${width}x${height}`)})
    const checkout=desktop.locator('.cart-summary .primary');await checkout.scrollIntoViewIfNeeded()
    assert.ok(await checkout.isVisible(),`checkout visible ${width}`)
    await checkout.click();await desktop.locator('.checkout-modal').waitFor()
    await layout(desktop,`desktop checkout ${width}`)
    await desktop.getByRole('button',{name:/Easypaisa/}).click()
    const place=desktop.locator('.place-order');await place.scrollIntoViewIfNeeded()
    assert.equal(await place.isEnabled(),true,'optional reference must allow payment confirmation')
    const box=await place.boundingBox();assert.ok(box.y>=0&&box.y+box.height<=height+1,`place button must be reachable ${width}`)
    if(width===390||width===1440) await shot(desktop,`desktop-checkout-${width}`)
    await desktop.locator('.checkout-modal header button').click()
  }
  await desktop.locator('.premium-pos > aside nav button').filter({hasText:'Settings'}).click()
  await desktop.setViewportSize({width:360,height:800});await layout(desktop,'desktop settings 360')
  await d.close();console.log('Desktop: cached offline catalog and checkout checked at eight sizes')
  console.log(JSON.stringify({report,failures},null,2))
  assert.equal(failures.length,0,'layout/runtime failures must be fixed')
} finally {
  if(staffId) { check(await db.from('register_shifts').delete().eq('opened_by',staffId),'clean QA shift');check(await db.from('audit_logs').delete().eq('actor_id',staffId),'clean QA audit');check(await db.from('staff_memberships').delete().eq('user_id',staffId),'clean QA membership');check(await db.auth.admin.deleteUser(staffId),'clean QA identity') }
  await browser.close()
}
