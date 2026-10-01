import assert from 'node:assert/strict';
import { mkdir, writeFile } from 'node:fs/promises';
import { chromium, expect } from 'playwright/test';

const base = process.env.STAGING_WEBSITE_URL || 'http://localhost:3103';
assert.match(new URL(base).hostname, /^(localhost|127\.0\.0\.1)$|staging|\.vercel\.app$/);
const output = 'artifacts/website-deep-recovery';
await mkdir(output, { recursive: true });
const browser = await chromium.launch({channel:'chrome',headless:true});
const context = await browser.newContext({viewport:{width:1440,height:900}});
const page = await context.newPage();
page.setDefaultNavigationTimeout(60000);
const errors = [], checks = [];
page.on('pageerror', error => errors.push(error.message));
const pass = name => { checks.push(name); console.log('PASS:', name); };
try {
  await page.goto(base, {waitUntil:'networkidle'});
  const first = page.locator('[data-menu-trigger=restaurant]');
  const second = page.locator('[data-menu-trigger=development]');
  for (let i=0;i<20;i++) {
    await first.hover(); await expect(first).toHaveAttribute('aria-expanded','true');
    await page.locator('#nav-restaurant a').first().hover(); await expect(first).toHaveAttribute('aria-expanded','true');
    await page.mouse.move(1350,700); await expect(first).toHaveAttribute('aria-expanded','false');
  }
  pass('20 hover/corridor/leave cycles, no stuck menu');
  for (let i=0;i<5;i++) { await first.hover(); await second.hover(); await expect(first).toHaveAttribute('aria-expanded','false'); await expect(second).toHaveAttribute('aria-expanded','true'); }
  await page.keyboard.press('Escape'); await expect(second).toHaveAttribute('aria-expanded','false'); await expect(second).toBeFocused();
  await first.focus(); await page.keyboard.press('ArrowDown'); await expect(page.locator('#nav-restaurant a').first()).toBeFocused();
  await page.keyboard.press('Escape'); await expect(first).toBeFocused();
  await first.hover(); await page.mouse.click(1350,700); await expect(first).toHaveAttribute('aria-expanded','false');
  pass('menu switching, keyboard, Escape focus restoration, outside click');
  await page.getByRole('button',{name:'Restaurant Admin',exact:true}).click();
  await page.getByRole('button',{name:'Next product screen'}).click(); await expect(page.locator('.product-screen-caption strong')).toHaveText('Online ordering');
  await page.keyboard.press('ArrowLeft'); await expect(page.locator('.product-screen-caption strong')).toHaveText('Restaurant Admin');
  pass('actual product screenshots, manual carousel and keyboard');
  await page.locator('.header-actions').getByRole('link',{name:'Client portal'}).click(); await page.waitForURL('**/client-portal');
  await expect(page.getByRole('heading',{name:'Your QaziPro application.'})).toBeVisible(); pass('Client Portal links to separate application auth');
  for (const width of [360,390,430,768,1024,1280,1366,1440,1920]) {
    await page.setViewportSize({width,height:900}); await page.goto(base,{waitUntil:'networkidle'});
    const layout = await page.evaluate(() => ({overflow:document.documentElement.scrollWidth-innerWidth,gap:document.querySelector('.hero-copy').getBoundingClientRect().top-document.querySelector('header').getBoundingClientRect().bottom}));
    assert.ok(layout.overflow<=1,`overflow ${width}: ${layout.overflow}`); assert.ok(layout.gap>=0&&layout.gap<=100,`hero gap ${width}: ${layout.gap}`);
    if(width===390 || width===1440)await page.screenshot({path:`${output}/home-${width}.png`});
    if(width<=1100){ await page.getByRole('button',{name:'Open menu',exact:true}).click(); await page.locator('.mobile-nav summary').first().click(); await page.locator('.mobile-nav').getByRole('link',{name:'Restaurant POS',exact:true}).click(); await page.waitForURL('**/restaurant-pos'); await expect(page.getByRole('button',{name:'Open menu',exact:true})).toBeVisible(); await page.getByRole('button',{name:'Open menu',exact:true}).click(); await page.keyboard.press('Escape'); await expect(page.getByRole('button',{name:'Open menu',exact:true})).toBeFocused(); assert.equal(await page.evaluate(()=>document.body.style.overflow),''); }
    pass(`responsive header/hero and mobile navigation ${width}px`);
  }
  for (const width of [360,390,430,768,1024,1280,1366,1440,1920]) {
    await page.setViewportSize({width,height:900}); await page.goto(base+'/portfolio',{waitUntil:'networkidle'});
    const grid=await page.locator('.project-grid').evaluate(el=>({columns:getComputedStyle(el).gridTemplateColumns.split(' ').length,overflow:document.documentElement.scrollWidth-innerWidth}));
    assert.equal(grid.columns,width<=640?1:width<=1100?2:3); assert.ok(grid.overflow<=1,`portfolio overflow ${width}`);
  }
  await page.getByRole('button',{name:'Online ordering',exact:true}).click(); await expect(page.locator('.project-card')).toHaveCount(2);
  await page.getByRole('button',{name:'All',exact:true}).click(); await expect(page.locator('.project-card')).toHaveCount(21);
  pass('portfolio grid at all nine widths and category filter/reset');
  for (const path of ['/portfolio','/about','/contact','/book-a-demo','/client-onboarding','/client-portal','/restaurant-platform','/restaurant-pos','/online-ordering','/services','/pricing','/privacy','/terms','/security']) {
    const response=await page.goto(base+path,{waitUntil:'networkidle'}); assert.equal(response.status(),200,path);
    await expect(page.locator('h1').first()).toBeVisible();
    await page.locator('footer').scrollIntoViewIfNeeded();
    await expect.poll(()=>page.locator('.footer-logo img').evaluate(img=>img.complete&&img.naturalWidth>0)).toBe(true);
    assert.ok(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth+1),path+' overflow');
    pass(path+' content, footer logo and layout');
  }
  await page.goto(base+'/our-work'); await page.waitForURL('**/portfolio'); pass('Our Work legacy route redirects to canonical portfolio');
  await page.emulateMedia({reducedMotion:'reduce'}); await page.goto(base,{waitUntil:'domcontentloaded'}); await expect(page.getByRole('button',{name:'Start product slideshow'})).toBeDisabled(); pass('reduced motion disables autoplay');
  assert.deepEqual(errors,[]); pass('no browser runtime errors');
  await writeFile(output+'/report.json',JSON.stringify({base,checks,errors},null,2));
} finally {await browser.close();}
