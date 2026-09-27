// Actual React components with isolated transports. Never sends external email.
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
    import { OrderFeedback } from "./components/reviews/order-feedback";
    import { OrderFeedbackManager } from "../admin/components/order-feedback-manager";
    window.posts=[]; window.updates=[]; window.readFails=false;
    window.fetch=async (url,options={})=> {
      if(options.method!=="POST") return {ok:!window.readFails,json:async()=>({eligible:true,feedback:null})};
      window.posts.push(JSON.parse(options.body));
      return new Promise(resolve=>window.finishFeedback=(ok)=>resolve({ok,json:async()=>({})}));
    };
    const root=createRoot(document.getElementById("root"));
    window.showCustomer=()=>root.render(<OrderFeedback orderNumber="ORDER-TEST"/>);
    window.showAdmin=()=>root.render(<OrderFeedbackManager businessId="business-a" branchId="branch-a" initialRows={[{id:"feedback-a",rating:5,comment:"Great meal",status:"NEW",created_at:"2026-09-27T10:00:00Z",orderNumber:"ORDER-TEST"}]}/>);
    window.showCustomer();
  `, resolveDir: customer, loader: "tsx" },
  tsconfig: customer + "tsconfig.json", bundle: true, write: false, platform: "browser", format: "iife", jsx: "automatic",
  alias: { react: dirname(require.resolve("react")), "react-dom": dirname(require.resolve("react-dom")) },
  plugins: [{ name: "isolated-feedback", setup(b) {
    b.onResolve({ filter: /^@\/lib\/(orders\/remote-orders|supabase\/client)$/ }, args=>({path:args.path,namespace:"fixture"}));
    b.onLoad({filter:/.*/,namespace:"fixture"},args=>({loader:"js",contents:args.path.includes("remote-orders")
      ? `export const getOrderToken=()=>null;`
      : `export function createClient(){const scoped=[];const query={update:value=>{window.updates.push({value,scoped});return query},eq:(key,value)=>{scoped.push([key,value]);return query},select:()=>query,maybeSingle:()=>new Promise(resolve=>window.finishReview=ok=>resolve({data:ok?{id:"feedback-a"}:null,error:ok?null:{code:"42501"}}))};return {from:()=>query};}` }));
  }}],
});
const browser = await chromium.launch({channel:"chrome",headless:true});
let checks=0;
const pass=name=>{checks++;console.log(`PASS ${name}`)};
try {
  const page=await browser.newPage({viewport:{width:390,height:844}});
  const errors=[];page.on("pageerror",error=>errors.push(error.message));
  await page.route("**/*",route=>route.fulfill({contentType:"text/html",body:'<main id="root"></main>'}));
  await page.goto("https://feedback.example.test");
  await page.addScriptTag({content:bundle.outputFiles[0].text});
  await page.getByRole("button",{name:"Send feedback",exact:true}).click();
  await expect(page.getByRole("alert")).toContainText("Choose a star rating");
  assert.equal(await page.evaluate(()=>window.posts.length),0);
  pass("missing rating shows inline validation without a request");
  await page.getByRole("radio",{name:"4 stars",exact:true}).check();
  await page.getByRole("textbox").fill("Keep this feedback after a network error");
  await page.getByRole("button",{name:"Send feedback",exact:true}).evaluate(node=>{node.click();node.click()});
  await expect(page.getByRole("button",{name:"Sending feedback…",exact:true})).toBeDisabled();
  assert.equal(await page.evaluate(()=>window.posts.length),1);
  await page.evaluate(()=>window.finishFeedback(false));
  await expect(page.getByRole("alert")).toContainText("couldn't be sent");
  await expect(page.getByRole("textbox")).toHaveValue("Keep this feedback after a network error");
  pass("same-frame double submit sends once; failure retains rating and comment");
  await page.getByRole("button",{name:"Send feedback",exact:true}).click();
  await page.evaluate(()=>window.finishFeedback(true));
  await expect(page.getByRole("heading",{name:"Thank you for sharing."})).toBeVisible();
  pass("successful retry shows private feedback confirmation");
  await page.evaluate(()=>window.showAdmin());
  await expect(page.getByText(/Order ORDER-TEST/)).toBeVisible();
  await page.getByRole("button",{name:"Mark reviewed",exact:true}).evaluate(node=>{node.click();node.click()});
  await expect(page.getByRole("button",{name:"Saving…",exact:true})).toBeDisabled();
  assert.deepEqual(await page.evaluate(()=>window.updates),[{value:{status:"REVIEWED"},scoped:[["id","feedback-a"],["business_id","business-a"],["branch_id","branch-a"]]}]);
  await page.evaluate(()=>window.finishReview(false));
  await expect(page.getByRole("alert")).toContainText("couldn't be marked reviewed");
  await page.getByRole("button",{name:"Mark reviewed",exact:true}).click();
  await page.evaluate(()=>window.finishReview(true));
  await page.getByRole("checkbox",{name:"New only"}).check();
  await expect(page.getByRole("heading",{name:"You're up to date"})).toBeVisible();
  pass("Admin sees order context; scoped review update is single-flight, recoverable and filterable");
  assert.deepEqual(errors,[]);pass("zero runtime errors; all transports isolated");
  console.log(`${checks} feedback browser checks passed; real delivery not claimed.`);
} finally { await browser.close() }
