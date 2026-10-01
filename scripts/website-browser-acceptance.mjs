import { chromium } from "playwright"
import { mkdir,writeFile } from "node:fs/promises"

const base=process.env.QAZIPRO_SITE_URL||"http://127.0.0.1:3003"
const output="artifacts/website-acceptance"
await mkdir(output,{recursive:true})
const browser=await chromium.launch({headless:true,channel:"chrome"})
const results=[]

for(const width of [360,390,430,768,1024,1440,1920]){
  const context=await browser.newContext({viewport:{width,height:Math.min(1100,Math.round(width*.9)+500)},reducedMotion:width===390?"reduce":"no-preference"})
  const page=await context.newPage(),consoleErrors=[],networkErrors=[]
  page.on("console",message=>{if(message.type()==="error")consoleErrors.push(message.text())})
  page.on("requestfailed",request=>networkErrors.push(`${request.method()} ${request.url()} ${request.failure()?.errorText??""}`))
  await page.goto(base,{waitUntil:"networkidle"})
  const home=await page.evaluate(()=>({title:document.title,h1:document.querySelector("h1")?.textContent?.trim(),overflow:document.documentElement.scrollWidth-document.documentElement.clientWidth,header:Boolean(document.querySelector("header")),footer:Boolean(document.querySelector("footer"))}))
  if(width<=430){await page.getByRole("button",{name:/open menu/i}).click();await page.getByRole("navigation",{name:"Mobile navigation"}).waitFor({state:"visible"});await page.keyboard.press("Escape").catch(()=>{})}
  await page.goto(`${base}/client-onboarding`,{waitUntil:"networkidle"})
  const onboarding=await page.evaluate(()=>({form:Boolean(document.querySelector("form.client-onboarding-form")),canvas:Boolean(document.querySelector("canvas")),overflow:document.documentElement.scrollWidth-document.documentElement.clientWidth,sections:document.querySelectorAll("form.client-onboarding-form>section").length}))
  if(width===1440)await page.screenshot({path:`${output}/home-${width}.png`,fullPage:true})
  if(width===390)await page.screenshot({path:`${output}/onboarding-${width}.png`,fullPage:true})
  results.push({width,home,onboarding,consoleErrors,networkErrors})
  await context.close()
}

const context=await browser.newContext({viewport:{width:1440,height:900}})
const page=await context.newPage()
await page.addInitScript(()=>{
  window.__qaziVitals={lcp:0,cls:0,inp:0}
  new PerformanceObserver(list=>{for(const item of list.getEntries())window.__qaziVitals.lcp=Math.max(window.__qaziVitals.lcp,item.startTime)}).observe({type:"largest-contentful-paint",buffered:true})
  new PerformanceObserver(list=>{for(const item of list.getEntries())if(!item.hadRecentInput)window.__qaziVitals.cls+=item.value}).observe({type:"layout-shift",buffered:true})
  try{new PerformanceObserver(list=>{for(const item of list.getEntries())window.__qaziVitals.inp=Math.max(window.__qaziVitals.inp,item.duration)}).observe({type:"event",buffered:true,durationThreshold:16})}catch{}
})
await page.goto(base,{waitUntil:"networkidle"})
await page.mouse.wheel(0,700)
await page.waitForTimeout(500)
const firstFaq=page.locator("summary").first()
if(await firstFaq.count())await firstFaq.click()
await page.waitForTimeout(700)
const performance=await page.evaluate(()=>({vitals:window.__qaziVitals,navigation:performance.getEntriesByType("navigation")[0]?.toJSON(),resources:performance.getEntriesByType("resource").length}))
await context.close();await browser.close()
const report={base,results,performance,passed:results.every(item=>item.home.title.includes("QaziPro")&&item.home.h1&&item.home.overflow<=1&&item.home.header&&item.home.footer&&item.onboarding.form&&item.onboarding.canvas&&item.onboarding.sections>=4&&item.onboarding.overflow<=1&&item.consoleErrors.length===0&&item.networkErrors.length===0)}
await writeFile(`${output}/report.json`,JSON.stringify(report,null,2))
console.log(JSON.stringify(report,null,2))
if(!report.passed)process.exitCode=1
