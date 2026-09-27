// Real React/browser behavior, with every provider/API isolated. No delivery.
import assert from "node:assert/strict";
import { createRequire } from "node:module";
import { dirname } from "node:path";
import { fileURLToPath } from "node:url";
import { build } from "esbuild";
import { chromium, expect } from "playwright/test";
const customer = fileURLToPath(new URL("../apps/customer/", import.meta.url));
const require = createRequire(new URL("../apps/customer/package.json", import.meta.url));
const bundle = await build({
  stdin: { contents: `
    import React from "react"; import { createRoot } from "react-dom/client";
    import { PushPreferences } from "./components/notifications/push-preferences";
    import { EmailPreferences } from "./components/notifications/email-preferences";
    import { CustomerPushManager } from "../admin/components/customer-push-manager";
    window.calls=[];window.permissions=0;window.permissionResult="granted";window.hasSubscription=false;
    const subscription={toJSON:()=>({endpoint:"https://fcm.googleapis.com/fcm/send/test",keys:{p256dh:"A".repeat(87),auth:"B".repeat(22)}}),unsubscribe:async()=>{window.hasSubscription=false;return true}};
    const registration={pushManager:{getSubscription:async()=>window.hasSubscription?subscription:null,subscribe:async()=>{window.hasSubscription=true;return subscription}}};
    Object.defineProperty(navigator,"serviceWorker",{value:{getRegistration:async()=>registration,register:async()=>registration,ready:Promise.resolve(registration)},configurable:true});
    window.PushManager=function(){};
    window.Notification={permission:"default",requestPermission:async()=>{window.permissions++;return window.permissionResult}};
    window.fetch=async(url,options={})=>{
      if(!options.method)return {ok:true,json:async()=>({configured:true,publicKey:"A".repeat(87),emailOffers:false})};
      window.calls.push({url,method:options.method,body:JSON.parse(options.body)});
      if(options.method==="DELETE")return {ok:true,json:async()=>({unsubscribed:true})};
      return new Promise(resolve=>window.finish=ok=>resolve({ok,json:async()=>ok?{subscribed:true,recipientCount:1,emailOffers:JSON.parse(options.body).emailOffers}:{error:"Connection interrupted"}}));
    };
    let key=0;const root=createRoot(document.getElementById("root"));
    window.showPush=(settings=false)=>root.render(<PushPreferences key={++key} settings={settings}/>);
    window.showAdmin=()=>root.render(<CustomerPushManager key={++key} branchName="Branch A" campaigns={[]}/>);
    window.showEmail=()=>root.render(<EmailPreferences key={++key}/>);
    window.showPush();
  `, resolveDir: customer, loader: "tsx" },
  tsconfig: customer + "tsconfig.json", bundle: true, write: false, platform: "browser", format: "iife", jsx: "automatic",
  alias: { react: dirname(require.resolve("react")), "react-dom": dirname(require.resolve("react-dom")) },
  plugins: [{ name: "isolated-push", setup(b) {
    b.onResolve({ filter: /^(@\/components\/providers\/app-provider|next\/navigation)$/ }, args=>({path:args.path,namespace:"fixture"}));
    b.onLoad({filter:/.*/,namespace:"fixture"},args=>({loader:"js",contents:args.path==="next/navigation"
      ? `export const useRouter=()=>({refresh:()=>{}});`
      : `export const useApp=()=>({authUserId:"customer-a",storefront:{business:{id:"business-a"}},cartCount:1});`}));
  }}],
});
const browser = await chromium.launch({channel:"chrome",headless:true});
let checks=0;const pass=name=>{checks++;console.log(`PASS ${name}`)};
try {
  const page=await browser.newPage({viewport:{width:390,height:844}});
  const errors=[];page.on("pageerror",error=>errors.push(error.message));
  await page.route("**/*",route=>route.fulfill({contentType:"text/html",body:'<main id="root"></main>'}));
  await page.goto("https://push.example.test");
  await page.addScriptTag({content:bundle.outputFiles[0].text});
  await expect(page.getByRole("button",{name:"Enable notifications"})).toBeVisible();
  assert.equal(await page.evaluate(()=>window.permissions),0);pass("soft prompt never requests native permission automatically");
  await page.getByRole("button",{name:"Not now"}).click();
  await page.evaluate(()=>window.showPush());
  await expect(page.getByRole("button",{name:"Enable notifications"})).toHaveCount(0);pass("dismissal persists across remounts");
  await page.evaluate(()=>{window.permissionResult="denied";window.showPush(true)});
  await page.getByRole("button",{name:"Enable notifications"}).click();
  await expect(page.getByText(/Notifications are blocked/)).toBeVisible();
  assert.equal(await page.evaluate(()=>window.calls.length),0);pass("native denial explains browser settings without registering");
  await page.evaluate(()=>{window.permissionResult="granted";window.showPush(true)});
  await page.getByRole("checkbox").check();
  await page.getByRole("button",{name:"Enable notifications"}).evaluate(node=>{node.click();node.click()});
  await expect(page.getByRole("button",{name:"Enabling…"})).toBeDisabled();
  await page.waitForFunction(()=>window.calls.length===1);
  assert.equal(await page.evaluate(()=>window.calls[0].body.marketing),true);
  await page.evaluate(()=>window.finish(false));
  await expect(page.getByRole("alert")).toContainText("Subscription could not be saved");
  await page.getByRole("button",{name:"Enable notifications"}).click();
  await page.waitForFunction(()=>window.calls.length===2);
  assert.equal(await page.evaluate(()=>window.calls[0].body.deviceId===window.calls[1].body.deviceId),true);
  await page.evaluate(()=>window.finish(true));
  await expect(page.getByRole("button",{name:"Unsubscribe this browser"})).toBeVisible();pass("subscribe double click, honest error and stable device retry");
  await page.getByRole("button",{name:"Unsubscribe this browser"}).click();
  await expect(page.getByRole("button",{name:"Enable notifications"})).toBeVisible();
  assert.equal(await page.evaluate(()=>window.hasSubscription),false);pass("unsubscribe removes API association and browser subscription");
  await page.evaluate(()=>{window.calls=[];window.showAdmin()});
  await page.getByLabel("Title",{exact:true}).fill("Dinner is ready");
  await page.getByLabel("Message",{exact:true}).fill("Browse today's menu.");
  await page.getByRole("button",{name:"Review notification"}).click();
  await page.getByRole("button",{name:"Confirm and queue"}).evaluate(node=>{node.click();node.click()});
  await page.waitForFunction(()=>window.calls.length===1);
  await page.evaluate(()=>window.finish(false));
  await expect(page.getByRole("alert")).toContainText("Connection interrupted");
  await page.getByRole("button",{name:"Confirm and queue"}).click();
  await page.waitForFunction(()=>window.calls.length===2);
  assert.equal(await page.evaluate(()=>window.calls[0].body.requestId===window.calls[1].body.requestId),true);
  await page.evaluate(()=>window.finish(true));
  await expect(page.getByRole("status")).toContainText("Queued is not delivered");pass("admin confirmation, double-submit guard and same-key retry preserve honest status");
  await page.evaluate(()=>{window.calls=[];window.showEmail()});
  const consent=page.getByRole("checkbox",{name:"Receive restaurant offers by email"});
  await expect(consent).toBeEnabled();await expect(consent).not.toBeChecked();
  await consent.click();await expect(consent).toBeDisabled();
  await page.waitForFunction(()=>window.calls.length===1);
  await page.evaluate(()=>window.finish(false));
  await expect(page.getByRole("alert")).toContainText("not confirmed");
  await expect(consent).not.toBeChecked();
  await consent.click();await page.waitForFunction(()=>window.calls.length===2);
  await page.evaluate(()=>window.finish(true));await expect(consent).toBeChecked();
  await consent.click();await page.waitForFunction(()=>window.calls.length===3);
  await page.evaluate(()=>window.finish(true));
  await expect(page.getByRole("status")).toContainText("Unsubscribed");
  pass("email explicit opt-in defaults off, pending lock, failure retains confirmed state and unsubscribe");
  assert.deepEqual(errors,[]);pass("no browser runtime errors");
  console.log(`${checks} browser push checks passed (isolated transport; not real delivery acceptance).`);
} finally { await browser.close(); }
