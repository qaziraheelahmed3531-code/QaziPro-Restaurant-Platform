import { chromium } from "playwright";
import { mkdir } from "node:fs/promises";
import path from "node:path";
import { createRequire } from "node:module";

const require = createRequire(import.meta.url);
const axePath = require.resolve("axe-core/axe.min.js");

const baseUrl = process.env.QA_BASE_URL || "http://localhost:3003";
const bypassToken = process.env.QA_BYPASS_TOKEN;
const routes = ["/", "/restaurant-platform", "/restaurant-pos", "/online-ordering", "/restaurant-mobile-apps", "/multi-branch", "/shopify-development", "/shopify-custom-themes", "/full-stack-development", "/services", "/portfolio", "/about", "/contact", "/book-a-demo", "/get-a-quote", "/client-onboarding", "/privacy", "/terms"];
const output = path.resolve("../.playwright-mcp/qazipro-premium");
await mkdir(output, { recursive: true });

const browser = await chromium.launch({ headless: true, executablePath: "C:/Program Files/Google/Chrome/Application/chrome.exe" });
const problems = [];

for (const viewport of [{ name: "desktop", width: 1440, height: 1000 }, { name: "mobile", width: 390, height: 844 }]) {
  const context = await browser.newContext({
    viewport,
    reducedMotion: "no-preference",
    extraHTTPHeaders: bypassToken ? { "x-vercel-protection-bypass": bypassToken } : undefined,
  });
  for (const route of routes) {
    const page = await context.newPage();
    const consoleErrors = [];
    page.on("console", (message) => { if (message.type() === "error") consoleErrors.push(message.text()); });
    page.on("pageerror", (error) => consoleErrors.push(error.message));
    const response = await page.goto(`${baseUrl}${route}`, { waitUntil: "networkidle", timeout: 30_000 });
    const metrics = await page.evaluate(() => ({
      overflow: document.documentElement.scrollWidth - document.documentElement.clientWidth,
      missingImages: Array.from(document.images).filter((image) => image.complete && image.naturalWidth === 0).map((image) => image.currentSrc || image.src),
      title: document.title,
    }));
    if (!response?.ok()) problems.push(`${viewport.name} ${route}: HTTP ${response?.status()}`);
    if (metrics.overflow > 1) problems.push(`${viewport.name} ${route}: ${metrics.overflow}px horizontal overflow`);
    if (metrics.missingImages.length) problems.push(`${viewport.name} ${route}: ${metrics.missingImages.length} missing images`);
    if (consoleErrors.length) problems.push(`${viewport.name} ${route}: console ${consoleErrors.join(" | ")}`);
    if (viewport.name === "desktop") {
      // Audit the settled interface instead of sampling text halfway through a
      // translucent entrance animation, which produces false contrast ratios.
      await page.emulateMedia({ reducedMotion: "reduce" });
      await page.mouse.move(1, 1);
      await page.waitForTimeout(950);
      await page.addScriptTag({ path: axePath });
      const violations = await page.evaluate(async () => {
        const result = await window.axe.run(document, { resultTypes: ["violations"] });
        return result.violations.filter((violation) => violation.impact === "critical" || violation.impact === "serious").map((violation) => `${violation.id} (${violation.nodes.length})`);
      });
      if (violations.length) problems.push(`accessibility ${route}: ${violations.join(", ")}`);
      await page.emulateMedia({ reducedMotion: "no-preference" });
    }
    if (viewport.name === "mobile" && route === "/") {
      await page.getByRole("button", { name: "Open menu" }).click();
      if (!(await page.locator("#mobile-navigation").getAttribute("class"))?.includes("mobile-nav-open")) problems.push("mobile menu did not open");
      await page.getByRole("button", { name: "Close menu" }).click();
    }
    if (["/", "/portfolio", "/about", "/shopify-development"].includes(route)) {
      const slug = route === "/" ? "home" : route.slice(1);
      await page.evaluate(async () => {
        for (let y = 0; y < document.documentElement.scrollHeight; y += Math.max(420, window.innerHeight * 0.72)) {
          window.scrollTo({ top: y });
          await new Promise((resolve) => setTimeout(resolve, 90));
        }
        window.scrollTo({ top: 0 });
      });
      await page.waitForTimeout(350);
      await page.screenshot({ path: path.join(output, `${slug}-${viewport.name}.png`), fullPage: true });
    }
    await page.close();
  }
  await context.close();
}

const reduced = await browser.newContext({
  viewport: { width: 1440, height: 900 },
  reducedMotion: "reduce",
  extraHTTPHeaders: bypassToken ? { "x-vercel-protection-bypass": bypassToken } : undefined,
});
const reducedPage = await reduced.newPage();
await reducedPage.goto(baseUrl, { waitUntil: "networkidle" });
const animationName = await reducedPage.locator(".marquee-track").evaluate((element) => getComputedStyle(element).animationName);
if (animationName !== "none") problems.push(`reduced motion: marquee animation is ${animationName}`);
await reduced.close();
await browser.close();

if (problems.length) {
  console.error(problems.join("\n"));
  process.exit(1);
}
console.log(`QA passed: ${routes.length} routes × desktop/mobile, key screenshots, menu, images, console, overflow and reduced motion.`);
