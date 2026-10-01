import { readdir, readFile } from "node:fs/promises";
import { join } from "node:path";

const roots = [
  "apps/mobile/dist/android",
  "apps/mobile/dist/ios",
  "apps/mobile/dist/operations-android",
  "apps/mobile/dist/operations-ios",
];
const forbidden = [
  /http:\/\/(?:localhost|127\.0\.0\.1|10\.0\.2\.2):(?:3000\/api\/v1|54321)(?:\/|\x00|$)/i,
  /eyJ[A-Za-z0-9_-]{30,}\.[A-Za-z0-9_-]{10,}\.[A-Za-z0-9_-]{10,}/,
  /SUPABASE_SERVICE_ROLE_KEY\s*=/,
  /FCM_PRIVATE_KEY\s*=/,
  /APNS_PRIVATE_KEY\s*=/,
  /-----BEGIN (?:RSA |EC )?PRIVATE KEY-----/,
];

async function files(directory) {
  const entries = await readdir(directory, { withFileTypes: true });
  return (
    await Promise.all(
      entries.map((entry) => {
        const path = join(directory, entry.name);
        return entry.isDirectory() ? files(path) : [path];
      }),
    )
  ).flat();
}

const scanned = (await Promise.all(roots.map(files))).flat();
const findings = [];
let combined = "";
for (const file of scanned) {
  const content = (await readFile(file)).toString("latin1");
  combined += content;
  for (const pattern of forbidden)
    if (pattern.test(content)) findings.push(`${file}: ${pattern}`);
}
for (const required of [
  "qazipro-restaurant-customer-staging.vercel.app",
  "jzisqjvroxodvmqxzsob.supabase.co",
])
  if (!combined.includes(required))
    findings.push(`Expected staging configuration missing from artifacts: ${required}`);
if (findings.length) {
  console.error(findings.join("\n"));
  process.exitCode = 1;
} else {
  console.log(`PASS: ${scanned.length} exported mobile artifact files contain no forbidden local URLs or private credential markers.`);
}
