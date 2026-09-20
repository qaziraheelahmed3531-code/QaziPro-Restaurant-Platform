// Browser rendering QA using an explicitly supplied external Playwright install.
import { pathToFileURL } from 'node:url'
const { chromium }=await import(pathToFileURL(process.argv[2]).href)
const browser=await chromium.launch({channel:'chrome',headless:true})
try {
 for(const width of [1440,390]){
  const page=await browser.newPage({viewport:{width,height:900}})
  const errors=[];page.on('pageerror',e=>errors.push(e.message))
  await page.goto('http://localhost:3000',{waitUntil:'networkidle',timeout:90000})
  await page.locator('.site-footer').scrollIntoViewIfNeeded()
  await page.screenshot({path:`docs/qa-footer-${width}.png`,fullPage:false})
  console.log(JSON.stringify({width,overflow:await page.evaluate(()=>document.documentElement.scrollWidth>innerWidth),footer:await page.locator('.site-footer').innerText(),errors}))
  if(width===390){const accordion=page.locator('.site-footer details summary').first();if(await accordion.count()){await accordion.click();console.log('Mobile footer accordion open: '+await page.locator('.site-footer details').first().getAttribute('open'))}}
  await page.close()
 }
}finally{await browser.close()}
