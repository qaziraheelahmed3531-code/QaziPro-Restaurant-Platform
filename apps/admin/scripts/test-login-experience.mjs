// Real React/auth UI; provider calls intercepted. No real email, login or DB mutation.
import assert from "node:assert/strict";
import { readFile, mkdir } from "node:fs/promises";
import { fileURLToPath } from "node:url";
import { createRequire } from "node:module";
import { dirname } from "node:path";
import { build } from "esbuild";
import { chromium, expect } from "playwright/test";

const admin = fileURLToPath(new URL("../", import.meta.url));
const appRequire = createRequire(new URL("../package.json", import.meta.url));
const output = await build({
  tsconfig: fileURLToPath(new URL("../tsconfig.json", import.meta.url)),
  alias: { react: dirname(appRequire.resolve("react")), "react-dom": dirname(appRequire.resolve("react-dom")) },
  stdin: { contents: `
    import React from "react"; import { createRoot } from "react-dom/client";
    import { LoginForm } from "./components/login-form";
    import { LoginStories } from "./components/login-stories";
    window.calls = [];
    const root = createRoot(document.getElementById("root"));
    window.renderLogin = (initialError = "") => root.render(<main className="login-page"><div className="login-layout"><LoginStories/><LoginForm key={initialError} initialError={initialError}/></div></main>);
    window.renderLogin();
  `, resolveDir: admin, loader: "tsx" },
  bundle: true, write: false, format: "iife", platform: "browser", jsx: "automatic",
  plugins: [{ name: "auth-sandbox", setup(b) {
    b.onResolve({ filter: /^(@\/lib\/supabase\/client|next\/image|next\/link)$/ }, args => ({ path: args.path, namespace: "mock" }));
    b.onLoad({ filter: /.*/, namespace: "mock" }, args => ({ loader: "jsx", resolveDir: admin, contents: args.path === "next/image"
      ? `import React from "react"; export default function Image({priority, ...props}) { return <img {...props}/>; }`
      : args.path === "next/link" ? `import React from "react"; export default function Link(props) { return <a {...props}/>; }`
      : `const invoke = (method, args) => { window.calls.push({ method, args }); return new Promise((resolve, reject) => { window.finishAuth = (value, thrown) => thrown ? reject(Error("network unavailable")) : resolve(value); }); };
        export function createClient() { return { auth: {
          signInWithOtp: args => invoke("send", args),
          verifyOtp: args => invoke("verify", args),
          signInWithOAuth: args => invoke("google", args)
        } }; }` }));
  } }],
});
const css = (await Promise.all(["targeted-upgrades.css", "globals.css", "storefront-finish.css", "email-otp.css", "interaction-polish.css", "client-portal.css", "portal-skeleton.css", "login-experience.css"].map(name =>
  readFile(new URL("../app/" + name, import.meta.url), "utf8")))).join("\n").replace(/@import[^;]+;/g, "");
const browser = await chromium.launch({ channel: "chrome", headless: true });
let checks = 0;
const pass = name => { checks++; console.log("PASS " + name); };
const errors = [], blocked = [];
try {
  const context = await browser.newContext({ reducedMotion: "reduce", viewport: { width: 1440, height: 1000 } });
  await context.route("**/*", async route => {
    const url = new URL(route.request().url());
    if (url.origin === "http://qazipro.test" && url.pathname === "/login") return route.fulfill({ contentType: "text/html", body: '<div id="root"></div>' });
    if (url.origin === "http://qazipro.test" && url.pathname === "/auth/complete") return route.fulfill({ contentType: "text/html", body: "Canonical server authorization handoff" });
    if (url.pathname === "/qazipro-logo.png") return route.fulfill({ contentType: "image/png", body: await readFile(new URL("../public/qazipro-logo.png", import.meta.url)) });
    // Local placeholder only for remote Google artwork. No network permitted.
    if (url.hostname === "developers.google.com") return route.fulfill({ contentType: "image/svg+xml", body: '<svg xmlns="http://www.w3.org/2000/svg" width="20" height="20"><text y="16">G</text></svg>' });
    blocked.push(url.origin + url.pathname); return route.abort();
  });
  const page = await context.newPage();
  page.on("pageerror", e => { errors.push(e.message); console.error(e.message); });
  async function boot() {
    await page.goto("http://qazipro.test/login");
    await page.addStyleTag({ content: css + "body { font-family: Arial, sans-serif; }" });
    await page.addScriptTag({ content: output.outputFiles[0].text });
    await expect(page.getByRole("button", { name: "Send sign-in code", exact: true })).toBeVisible();
  }
  await page.clock.install();
  await boot();
  await expect(page.locator('input[type="password"]')).toHaveCount(0);
  await expect(page.getByRole("button", { name: /password/i })).toHaveCount(0);
  pass("primary login is Google + email code only, with no password controls");
  await page.getByLabel("Work email").fill("Owner@Restaurant.com");
  await page.locator(".login-form").evaluate(form => { form.requestSubmit(); form.requestSubmit(); });
  await expect(page.getByRole("button", { name: "Sending code…" })).toBeDisabled();
  assert.deepEqual(await page.evaluate(() => window.calls), [{ method: "send", args: { email: "owner@restaurant.com", options: { shouldCreateUser: true } } }]);
  await page.evaluate(() => window.finishAuth({ error: null }));
  await expect(page.locator(".otp-inputs input")).toHaveCount(8);
  await expect(page.locator(".otp-inputs input").first()).toBeFocused();
  pass("normalized email and same-frame double submit use one canonical OTP request");
  await page.locator(".otp-inputs input").first().fill("1234567");
  await expect(page.getByRole("button", { name: "Verify and sign in" })).toBeDisabled();
  await page.locator(".otp-inputs input").first().fill("12345678");
  await page.locator(".admin-otp-form").evaluate(form => { form.requestSubmit(); form.requestSubmit(); });
  assert.equal(await page.evaluate(() => window.calls.filter(c => c.method === "verify").length), 1);
  await page.evaluate(() => window.finishAuth({ error: { code: "otp_expired", message: "Token has expired or is invalid" }, data: {} }));
  await expect(page.getByRole("alert")).toBeVisible();
  await expect(page.getByRole("button", { name: "Verify and sign in" })).toBeEnabled();
  pass("requires eight digits, prevents duplicate verification and recovers from expired/invalid codes");
  await expect(page.getByRole("button", { name: /Resend in/ })).toBeDisabled();
  await page.clock.fastForward(61000);
  // Flush a tick scheduled by React after the wall-clock jump, without sleeping.
  await page.clock.runFor(1100);
  await page.getByRole("button", { name: "Resend code", exact: true }).click();
  await page.evaluate(() => window.finishAuth({ error: null }));
  await expect(page.getByRole("status")).toContainText("new code");
  assert.equal(await page.evaluate(() => window.calls.filter(c => c.method === "send").length), 2);
  await expect(page.locator(".otp-inputs input").first()).toHaveValue("");
  pass("wall-clock cooldown expires correctly; resend requests once and clears the previous code");
  await page.getByRole("button", { name: "Change email" }).click();
  await expect(page.getByRole("button", { name: /Try again in/ })).toBeDisabled();
  pass("changing email preserves cooldown and cannot immediately send another message");
  await page.clock.fastForward(61000);
  await page.clock.runFor(1100);
  await page.getByRole("button", { name: "Send sign-in code", exact: true }).click();
  await page.evaluate(() => window.finishAuth({ error: null }));
  await page.locator(".otp-inputs input").first().fill("12345678");
  await page.getByRole("button", { name: "Verify and sign in" }).click();
  await page.evaluate(() => window.finishAuth({ data: { user: { id: "test-owner" }, session: null }, error: null }));
  await expect(page.getByRole("alert")).toBeVisible();
  assert.equal(new URL(page.url()).pathname, "/login");
  await page.getByRole("button", { name: "Verify and sign in" }).click();
  await page.evaluate(() => window.finishAuth({ data: { user: { id: "test-owner" }, session: { access_token: "mock-not-a-real-token" } }, error: null }));
  await expect(page).toHaveURL("http://qazipro.test/auth/complete");
  pass("only a returned user + session navigates to canonical server authorization, not directly to dashboard");
  await boot();
  await page.getByRole("button", { name: "Continue with Google" }).evaluate(button => { button.click(); button.click(); });
  await expect(page.getByRole("button", { name: "Opening Google…" })).toBeDisabled();
  assert.deepEqual(await page.evaluate(() => window.calls), [{ method: "google", args: { provider: "google", options: { redirectTo: "http://qazipro.test/auth/callback" } } }]);
  await page.evaluate(() => window.finishAuth(null, true));
  await expect(page.getByRole("alert")).toContainText("could not be started");
  await expect(page.getByRole("button", { name: "Continue with Google" })).toBeEnabled();
  pass("Google starts once with same-origin callback; transport failure visibly unlocks controls");
  await boot();
  const artifacts = new URL("../../../docs/qa/restaurant-admin-login/", import.meta.url);
  await mkdir(artifacts, { recursive: true });
  for (const width of [360, 768, 1440]) {
    await page.setViewportSize({ width, height: 1000 });
    await expect(page.getByRole("button", { name: "Continue with Google" })).toBeVisible();
    assert.ok(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth));
    await page.screenshot({ path: fileURLToPath(new URL(`login-${width}.png`, artifacts)), fullPage: true });
  }
  pass("no page overflow at 360/768/1440px; primary login remains available on mobile");
  const active = () => page.locator(".login-showcase__dots [aria-pressed=true]").getAttribute("aria-label");
  const first = await active();
  await page.clock.runFor(5000);
  assert.equal(await active(), first);
  await page.getByRole("button", { name: "Next operation" }).click();
  assert.notEqual(await active(), first);
  pass("reduced motion disables auto-rotation but preserves manual navigation");
  await page.emulateMedia({ reducedMotion: "no-preference" });
  await page.setViewportSize({ width: 1440, height: 1000 });
  await page.getByRole("button", { name: "Start showcase rotation" }).click();
  await page.mouse.move(1400, 10);
  const before = await active();
  await page.clock.runFor(2300);
  assert.notEqual(await active(), before);
  await page.getByRole("button", { name: "Pause showcase rotation" }).click();
  const stopped = await active();
  await page.clock.runFor(5000);
  assert.equal(await active(), stopped);
  pass("showcase advances about every 2.2 seconds and explicit pause stops rotation");
  await page.getByRole("button", { name: "Start showcase rotation" }).click();
  await page.getByRole("button", { name: "Next operation" }).focus();
  await page.mouse.move(1400, 10);
  const focused = await active();
  await page.clock.runFor(5000);
  assert.equal(await active(), focused);
  pass("keyboard navigation stops auto-rotation until explicitly restarted");
  assert.deepEqual(blocked, []); assert.deepEqual(errors, []);
  pass("zero external auth/email requests and zero browser runtime errors");
  console.log(`${checks} checks passed. Mock provider only; not real delivery or public authorization evidence.`);
} finally { await browser.close(); }
