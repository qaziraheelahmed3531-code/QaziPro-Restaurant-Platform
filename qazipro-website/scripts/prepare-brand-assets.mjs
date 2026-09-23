import sharp from "sharp";

const logoSource = "C:/Users/Qazi Raheel/Downloads/ChatGPT Image Sep 23, 2026, 10_58_13 AM.png";
const { data, info } = await sharp(logoSource).ensureAlpha().raw().toBuffer({ resolveWithObject: true });
for (let index = 0; index < data.length; index += 4) {
  const luminance = (data[index] + data[index + 1] + data[index + 2]) / 3;
  data[index] = 0;
  data[index + 1] = 0;
  data[index + 2] = 0;
  // The supplied artwork has a soft off-white vignette. Keep the black mark
  // faithfully while removing that photographed background and its shadow.
  data[index + 3] = Math.max(0, Math.min(255, Math.round((205 - luminance) * 7)));
}
await sharp(data, { raw: info })
  .trim({ background: { r: 0, g: 0, b: 0, alpha: 0 } })
  .resize({ width: 720, withoutEnlargement: true })
  .png()
  .toFile("public/brand/qazipro-mark-clean.png");

const circleMask = Buffer.from('<svg width="512" height="512"><circle cx="256" cy="256" r="255" fill="white"/></svg>');
await sharp("C:/Users/Qazi Raheel/Downloads/ChatGPT Image Sep 23, 2026, 06_21_08 AM.png")
  .extract({ left: 262, top: 245, width: 730, height: 730 })
  .resize(512, 512)
  .composite([{ input: circleMask, blend: "dest-in" }])
  .png()
  .toFile("public/brand/whatsapp.png");

await sharp("C:/Users/Qazi Raheel/Downloads/Shopify-Logo.png")
  .trim()
  .resize({ width: 900, withoutEnlargement: true })
  .png()
  .toFile("public/brand/shopify-logo.png");

await sharp("C:/Users/Qazi Raheel/Downloads/Shopify-Logo.png")
  .extract({ left: 0, top: 480, width: 1050, height: 1200 })
  .resize({ width: 420, withoutEnlargement: true })
  .png()
  .toFile("public/brand/shopify-mark-clean.png");

console.log("Brand assets prepared.");
