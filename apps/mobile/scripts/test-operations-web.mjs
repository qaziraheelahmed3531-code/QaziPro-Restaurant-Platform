import assert from "node:assert/strict";
import fs from "node:fs/promises";
import path from "node:path";
import { chromium } from "playwright";

const baseUrl = process.argv[2] || "http://localhost:8082";
const output = path.resolve("test-results/operations-web");
await fs.mkdir(output, { recursive: true });

const browser = await chromium.launch({
  headless: true,
  executablePath:
    process.env.PLAYWRIGHT_CHROME_PATH ||
    "C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe",
});
const errors = [];
const timings = [];
try {
  for (const viewport of [
    { name: "phone", width: 390, height: 844 },
    { name: "tablet", width: 768, height: 1024 },
    { name: "large-tablet", width: 1024, height: 768 },
  ]) {
    const page = await browser.newPage({
      viewport: { width: viewport.width, height: viewport.height },
      reducedMotion: "reduce",
    });
    page.on("console", (message) => {
      if (message.type() === "error") errors.push(`${viewport.name}: ${message.text()}`);
    });
    page.on("pageerror", (error) => errors.push(`${viewport.name}: ${error.message}`));
    const started = performance.now();
    const response = await page.goto(baseUrl, {
      waitUntil: "domcontentloaded",
      timeout: 30_000,
    });
    assert(response?.ok(), `${viewport.name} returned ${response?.status()}`);
    try {
      await page.getByRole("heading", { name: "QaziPro Operations" }).waitFor({ timeout: 15_000 });
    } catch (error) {
      await page.screenshot({ path: path.join(output, `${viewport.name}-failure.png`), fullPage: true });
      console.error(JSON.stringify({ url: page.url(), body: (await page.locator("body").innerText()).slice(0, 2_000), errors }, null, 2));
      throw error;
    }
    await page.getByLabel("Work email").waitFor();
    await page.getByRole("button", { name: "Send 8-digit code" }).waitFor();
    await page.getByRole("button", { name: "Continue with Google" }).waitFor();
    const box = await page.getByRole("heading", { name: "QaziPro Operations" }).boundingBox();
    assert(box && box.x >= 0 && box.x + box.width <= viewport.width, `${viewport.name} heading clipped`);
    const inputBox = await page.getByLabel("Work email").boundingBox();
    const buttonBox = await page.getByRole("button", { name: "Continue with Google" }).boundingBox();
    const minimumControlWidth = viewport.width < 500 ? 280 : 450;
    assert(inputBox && inputBox.width >= minimumControlWidth, `${viewport.name} email field collapsed`);
    assert(buttonBox && buttonBox.width >= minimumControlWidth, `${viewport.name} action collapsed`);
    await page.screenshot({
      path: path.join(output, `${viewport.name}.png`),
      fullPage: true,
    });
    timings.push({ viewport: viewport.name, loginReadyMs: Math.round(performance.now() - started) });
    await page.close();
  }
  assert.deepEqual(errors, [], `Browser errors:\n${errors.join("\n")}`);
  console.log(JSON.stringify({ passed: 3, failed: 0, timings, errors }, null, 2));
} finally {
  await browser.close();
}
