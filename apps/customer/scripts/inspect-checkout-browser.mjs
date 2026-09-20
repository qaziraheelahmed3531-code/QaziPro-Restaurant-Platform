import { pathToFileURL } from 'node:url'
const {chromium}=await import(pathToFileURL(process.argv[2]).href)
const browser=await chromium.launch({channel:'chrome',headless:true})
try{
 const page=await browser.newPage({viewport:{width:1440,height:1000}})
 await page.goto('http://localhost:3000',{waitUntil:'domcontentloaded',timeout:90000})
 await page.getByRole('button',{name:/Select your area/i}).click()
 console.log('LOCATION: '+await page.getByRole('dialog').innerText())
 await page.getByRole('combobox').last().click()
 const area=page.getByRole('option',{name:/Hamlet Colony/i}).first();await area.click()
 await page.getByRole('button',{name:'Select',exact:true}).click()
 console.log('AFTER AREA: '+(await page.locator('body').innerText()).slice(-1800))
 const product=page.locator('article').filter({hasText:'Zinger Burger'}).first();await product.getByRole('button',{name:'Add',exact:true}).click()
 console.log('AFTER ADD: '+(await page.locator('body').innerText()).slice(-2600))
 await page.getByRole('link',{name:'Checkout',exact:true}).click()
 await page.getByRole('heading',{name:'Complete your order'}).waitFor({timeout:60000})
 console.log('CHECKOUT: '+await page.locator('main').innerText())
 await page.screenshot({path:'docs/qa-checkout-before.png',fullPage:true})
}catch(error){console.error(error.message)}finally{await browser.close()}
