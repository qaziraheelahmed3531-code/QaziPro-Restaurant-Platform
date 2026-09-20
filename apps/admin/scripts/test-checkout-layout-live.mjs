import assert from 'node:assert/strict'
import {randomUUID} from 'node:crypto'
import {chromium} from 'playwright'
import {createClient} from '@supabase/supabase-js'
import {createServerClient} from '@supabase/ssr'
process.loadEnvFile(new URL('../../backend/.env.local',import.meta.url))
const env=process.env,db=createClient(env.NEXT_PUBLIC_SUPABASE_URL,env.SUPABASE_SERVICE_ROLE_KEY,{auth:{persistSession:false,autoRefreshToken:false}})
const check=(r)=>{if(r.error)throw Error(r.error.message);return r.data}
const browser=await chromium.launch({channel:'chrome',headless:true})
let user
try{
  const branch=check(await db.from('branches').select('id,business_id').eq('is_active',true).order('sort_order').limit(1).single())
  const email=`qa-checkout-${randomUUID()}@example.test`,password=`Qa!${randomUUID()}9`
  user=check(await db.auth.admin.createUser({email,password,email_confirm:true})).user.id
  check(await db.from('staff_memberships').insert({business_id:branch.business_id,user_id:user,role:'OWNER',is_active:true}))
  check(await db.from('register_shifts').insert({business_id:branch.business_id,branch_id:branch.id,opened_by:user,opening_cash:0,notes:'QA layout only'}))
  const jar=new Map()
  const auth=createServerClient(env.NEXT_PUBLIC_SUPABASE_URL,env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY,{cookieOptions:{name:'italian-pizza-admin-auth',path:'/',sameSite:'lax'},cookies:{getAll:()=>[...jar].map(([name,value])=>({name,value})),setAll:items=>items.forEach(({name,value})=>jar.set(name,value))}})
  check(await auth.auth.signInWithPassword({email,password}))
  const context=await browser.newContext()
  await context.addCookies([...jar].map(([name,value])=>({name,value,domain:'localhost',path:'/',sameSite:'Lax'})))
  await context.addCookies([{name:'ip-admin-branch',value:branch.id,domain:'localhost',path:'/',sameSite:'Lax'}])
  const page=await context.newPage()
  await page.goto('http://localhost:3001/pos',{waitUntil:'networkidle',timeout:120000})
  await page.locator('.pos-products button:not(:disabled)').first().click()
  const options=page.locator('.modifier-groups')
  if(await options.isVisible())await options.locator('..').getByRole('button',{name:'Add to order',exact:true}).click()
  await page.getByRole('button',{name:'Checkout',exact:true}).click()
  for(const [width,height] of [[390,844],[768,1024],[1440,900]]){
    await page.setViewportSize({width,height});await page.waitForTimeout(450)
    const modal=page.locator('.pos-checkout-modal')
    const box=await modal.boundingBox()
    assert.ok(box.x>=0&&box.x+box.width<=width,'modal must fit horizontally')
    const place=modal.getByRole('button',{name:/Place order/}).first()
    await place.scrollIntoViewIfNeeded()
    const button=await place.boundingBox();assert.ok(button.y>=0&&button.y+button.height<=height,'submit must be reachable')
    await page.screenshot({path:`docs/qa/interaction-polish/admin-checkout-${width}.png`})
  }
  await page.goto('http://localhost:3001/',{waitUntil:'networkidle',timeout:120000})
  await page.getByRole('button',{name:'This Year',exact:true}).click()
  await page.getByRole('button',{name:'This Year',exact:true}).waitFor()
  await page.waitForFunction(()=>!document.querySelector('.range-tabs button:disabled'))
  assert.ok(await page.locator('.report-donut').count()>0,'real sales should render donut breakdowns')
  await page.screenshot({path:'docs/qa/interaction-polish/admin-dashboard.png',fullPage:true})
  console.log('PASS: real-product checkout reachable at phone/tablet/desktop sizes; real annual sales donut charts rendered. No sale submitted.')
}finally{
  if(user){check(await db.from('register_shifts').delete().eq('opened_by',user));check(await db.from('audit_logs').delete().eq('actor_id',user));check(await db.from('staff_memberships').delete().eq('user_id',user));check(await db.auth.admin.deleteUser(user))}
  await browser.close()
}
