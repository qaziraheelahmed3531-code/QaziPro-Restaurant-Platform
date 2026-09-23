import { chromium } from "playwright";
import { mkdir } from "node:fs/promises";
import path from "node:path";

const projects = [
  ["allbirds", "https://www.allbirds.com/"],
  ["function18", "https://www.function18.com/"],
  ["suitshop", "https://suitshop.com/"],
  ["gymshark", "https://www.gymshark.com/"],
  ["swati", "https://www.swati.com/"],
  ["beard-and-blade", "https://www.beardandblade.com.au/"],
  ["laqstore", "https://laqstore.com/"],
  ["ainakwear", "https://ainakwear.com/"],
  ["gllasizmart", "https://gllasizmart.com/"],
  ["vyro", "https://vyro.pk/"],
  ["landearly", "https://www.landearly.com/"],
  ["hireaiscore", "https://www.hireaiscore.com/"],
  ["lords-school", "https://lordsschool.edu.pk/"],
  ["alfss", "https://alfss.edu.pk/"],
  ["the-academy", "https://www.theacademy.net.pk/"],
  ["dag-clinic", "https://www.dagclinic.com/"],
  ["dental-professionals", "https://www.dentalprofessionals.pk/"],
  ["thestmedia", "https://thestmedia.com/"],
  ["nuqta-creative-studio", "https://www.nuqtacreativestudio.com/"],
  ["muncho-bites", "https://munchobites.com/"],
  ["legend-cafe", "https://www.legendcafe.pk/"],
];

const output = path.resolve("public/projects");
await mkdir(output, { recursive: true });
const browser = await chromium.launch({
  headless: true,
  executablePath: "C:/Program Files/Google/Chrome/Application/chrome.exe",
});
const context = await browser.newContext({ viewport: { width: 1440, height: 900 }, deviceScaleFactor: 1 });

for (const [slug, url] of projects) {
  const page = await context.newPage();
  try {
    const response = await page.goto(url, { waitUntil: "domcontentloaded", timeout: 30_000 });
    await page.waitForTimeout(2500);
    for (const label of ["Accept all", "Accept", "Close", "Dismiss"]) {
      const button = page.getByRole("button", { name: label, exact: true });
      if (await button.count()) {
        try { await button.last().click({ timeout: 800 }); } catch { /* optional site chrome */ }
      }
    }
    await page.waitForTimeout(350);
    await page.screenshot({ path: path.join(output, `${slug}.jpg`), type: "jpeg", quality: 82 });
    console.log(`${slug}\t${response?.status() ?? "no-status"}\t${page.url()}`);
  } catch (error) {
    console.log(`${slug}\tFAILED\t${error instanceof Error ? error.message.split("\n")[0] : String(error)}`);
  } finally {
    await page.close();
  }
}

await browser.close();
