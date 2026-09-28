// Isolated browser evidence: genuine pending resources, no auth or live data.
import assert from "node:assert/strict"
import { readFile } from "node:fs/promises"
import { createRequire } from "node:module"
import { dirname } from "node:path"
import { fileURLToPath } from "node:url"
import { build } from "esbuild"
import { chromium, expect } from "playwright/test"

const appRoot = fileURLToPath(new URL("../", import.meta.url))
const appRequire = createRequire(new URL("../package.json", import.meta.url))
const output = await build({
  tsconfig: appRoot + "tsconfig.json",
  alias: { react: dirname(appRequire.resolve("react")), "react-dom": dirname(appRequire.resolve("react-dom")) },
  stdin: { resolveDir: appRoot, loader: "tsx", contents: `
    import React from "react";
    import { createRoot, hydrateRoot } from "react-dom/client";
    import { flushSync } from "react-dom";
    import { NavigationPending } from "./components/navigation-pending";
    import { TableQrPrint } from "./components/table-qr-print";
    let root;
    const host = document.getElementById("root");
    window.showNavigation = props => {
      root ??= createRoot(host);
      window.linkPending = props.pending;
      flushSync(() => root.render(<nav className="admin-nav"><a><span>Tables</span><NavigationPending active={props.active} label="Tables"/></a></nav>));
    };
    window.showQr = props => { root ??= createRoot(host); root.render(<TableQrPrint {...props}/>); };
    window.hydrateQr = props => { root = hydrateRoot(host, <TableQrPrint {...props}/>); };
    window.finishLoading = () => root.render(<h1>Ready</h1>);
  ` },
  bundle: true, write: false, format: "iife", platform: "browser", jsx: "automatic",
  plugins: [{ name: "next-link-status", setup(b) {
    b.onResolve({ filter: /^next\/link$/ }, () => ({ path: "next/link", namespace: "mock" }))
    b.onLoad({ filter: /.*/, namespace: "mock" }, () => ({ contents: "export const useLinkStatus = () => ({pending: window.linkPending});", loader: "js" }))
  } }],
})
const svg = '<svg xmlns="http://www.w3.org/2000/svg" width="320" height="320"><rect width="320" height="320" fill="white"/></svg>'
const props = { id: "fixture", name: "Table 12", restaurantName: "Fixture Restaurant", url: "https://fixture.invalid/t/opaque", imageSrc: "https://qr-preview.invalid/first.svg", active: true }
const browser = await chromium.launch({ channel: "chrome", headless: true })
let passed = 0
const pass = name => { passed++; console.log("PASS " + name) }
const held = new Map(), errors = [], external = []
try {
  const context = await browser.newContext({ viewport: { width: 1440, height: 900 } })
  await context.route("**/*", route => {
    const url = route.request().url()
    if (url.startsWith("https://qr-preview.invalid/")) held.set(url, route)
    else { external.push(url); return route.abort() }
  })
  const page = await context.newPage()
  page.on("pageerror", error => errors.push(error.message))
  await page.setContent('<main class="admin-content"><div id="root"></div></main>')
  await page.addStyleTag({ content: (await readFile(new URL("../app/globals.css", import.meta.url), "utf8")).replace(/@import[^;]+;/g, "") })
  await page.addScriptTag({ content: output.outputFiles[0].text })

  await page.evaluate(() => window.showNavigation({ pending: false, active: false }))
  const indicator = page.locator("[data-navigation-pending]")
  const idleBox = await indicator.boundingBox()
  await expect(page.getByRole("status")).toHaveCount(0)
  await page.evaluate(() => window.showNavigation({ pending: true, active: false }))
  await expect(page.getByRole("status", { name: "Opening Tables" })).toBeVisible()
  assert.deepEqual(await indicator.boundingBox(), idleBox)
  pass("navigation retains a visible loader and reserved geometry during genuine pending")
  await page.evaluate(() => window.showNavigation({ pending: false, active: false }))
  await expect(page.getByRole("status")).toHaveCount(0)
  await page.evaluate(() => window.showNavigation({ pending: true, active: true }))
  await expect(page.getByRole("status")).toHaveCount(0)
  await page.evaluate(() => window.showNavigation({ pending: false, active: false }))
  await expect(page.getByRole("status")).toHaveCount(0)
  pass("completion, cancellation, QR descendants and back navigation leave no stuck spinner")

  await page.evaluate(props => window.showQr(props), props)
  await expect.poll(() => held.has(props.imageSrc)).toBe(true)
  await expect(page.getByRole("status", { name: "Loading QR preview" })).toBeVisible()
  await expect(page.getByRole("button", { name: "Loading QR…" })).toBeDisabled()
  const qrBox = await page.locator(".table-qr-preview").boundingBox()
  await held.get(props.imageSrc).fulfill({ contentType: "image/svg+xml", body: svg })
  await expect(page.getByRole("button", { name: "Print QR", exact: true })).toBeEnabled()
  await expect(page.getByRole("status")).toHaveCount(0)
  assert.deepEqual(await page.locator(".table-qr-preview").boundingBox(), qrBox)
  pass("QR load shows local feedback, preserves layout and releases Print on real readiness")

  const second = { ...props, imageSrc: "https://qr-preview.invalid/second.svg" }
  await page.evaluate(props => window.showQr(props), second)
  await expect.poll(() => held.has(second.imageSrc)).toBe(true)
  await expect(page.getByRole("button", { name: "Loading QR…" })).toBeDisabled()
  await held.get(second.imageSrc).abort()
  await expect(page.getByRole("alert")).toContainText("QR could not be loaded")
  await expect(page.getByRole("status")).toHaveCount(0)
  await expect(page.getByRole("button", { name: "QR unavailable" })).toBeDisabled()
  pass("new QR source cannot inherit readiness; failure ends loading with explicit feedback")
  const retry = { ...props, imageSrc: "https://qr-preview.invalid/retry.svg" }
  await page.evaluate(props => window.showQr(props), retry)
  await expect.poll(() => held.has(retry.imageSrc)).toBe(true)
  await held.get(retry.imageSrc).fulfill({ contentType: "image/svg+xml", body: svg })
  await expect(page.getByRole("button", { name: "Print QR", exact: true })).toBeEnabled()
  await expect(page.getByRole("alert")).toHaveCount(0)
  for (const width of [360, 390, 768, 1440]) {
    await page.setViewportSize({ width, height: 900 })
    assert.equal(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth), true)
  }
  pass("retry recovers and QR layout remains usable on mobile, tablet and desktop")

  // Render HTML before client handlers, then hydrate an already-loaded inline image.
  const { renderToString } = appRequire("react-dom/server")
  const React = appRequire("react")
  const serverBundle = await build({ tsconfig: appRoot + "tsconfig.json", entryPoints: [appRoot + "components/table-qr-print.tsx"], bundle: true, write: false, platform: "node", format: "cjs", jsx: "automatic", external: ["react", "react/jsx-runtime"] })
  const fixtureModule = { exports: {} }
  new Function("require", "module", "exports", serverBundle.outputFiles[0].text)(appRequire, fixtureModule, fixtureModule.exports)
  const cachedProps = { ...props, imageSrc: "data:image/svg+xml," + encodeURIComponent(svg) }
  const cached = await context.newPage()
  cached.on("pageerror", error => errors.push(error.message))
  await cached.setContent('<div id="root">' + renderToString(React.createElement(fixtureModule.exports.TableQrPrint, cachedProps)) + '</div>')
  await expect.poll(() => cached.locator("img").evaluate(img => img.complete && img.naturalWidth > 0)).toBe(true)
  await cached.addScriptTag({ content: output.outputFiles[0].text })
  await cached.evaluate(props => window.hydrateQr(props), cachedProps)
  await expect(cached.getByRole("button", { name: "Print QR", exact: true })).toBeEnabled()
  await expect(cached.getByRole("status")).toHaveCount(0)
  pass("pre-hydration cached image cannot leave QR loader or Print stuck")

  await page.emulateMedia({ reducedMotion: "reduce" })
  await page.evaluate(() => window.showNavigation({ pending: true, active: false }))
  await expect(page.getByRole("status", { name: "Opening Tables" })).toBeVisible()
  await page.evaluate(() => window.finishLoading())
  await expect(page.getByRole("status")).toHaveCount(0)
  assert.deepEqual(errors, []); assert.deepEqual(external, [])
  pass("reduced-motion loading stays understandable; no runtime errors or external requests")
  console.log(`${passed} loading regression checks passed (isolated browser, not authenticated staging acceptance).`)
} finally { await browser.close() }
