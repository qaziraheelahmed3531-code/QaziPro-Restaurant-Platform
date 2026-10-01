import { spawn } from "node:child_process";
import { createRequire } from "node:module";
import { prepareDevelopmentEnvironment } from "./development-environment.mjs";

const platform = process.argv[2];
if (!new Set(["android", "ios", "web"]).has(platform)) {
  console.error("Expected android, ios or web.");
  process.exit(1);
}

// Load only the existing public staging Supabase connection values. The
// operations bundle does not embed any service-role or server credential.
prepareDevelopmentEnvironment("web");
Object.assign(process.env, {
  EXPO_PUBLIC_APP_ENV: "staging",
  EXPO_PUBLIC_MOBILE_SURFACE: "operations",
  EXPO_PUBLIC_MOBILE_ROLE_HINT: "auto",
  EXPO_PUBLIC_API_BASE_URL:
    "https://qazipro-restaurant-customer-staging.vercel.app/api/v1",
  EXPO_PUBLIC_RESTAURANT_KEY: "qa-restaurant-a",
  EXPO_PUBLIC_LINK_DOMAIN: "restaurant-a.staging.qazipro.com",
  EXPO_PUBLIC_ENABLE_PUSH: "false",
  MOBILE_APP_VARIANT: "operations",
  MOBILE_APP_NAME: "QaziPro Operations Staging",
  MOBILE_APP_SLUG: "qazipro-operations",
  MOBILE_APP_SCHEME: "qazipro-ops",
  MOBILE_ANDROID_APPLICATION_ID: "com.qazipro.operations.staging",
  MOBILE_IOS_BUNDLE_ID: "com.qazipro.operations.staging",
  MOBILE_LINK_DOMAIN: "restaurant-a.staging.qazipro.com",
});

const require = createRequire(import.meta.url);
const expoCli = require.resolve("expo/bin/cli");
const output = `dist/operations-${platform}`;
const args = ["export", "--platform", platform, "--output-dir", output];
if (process.env.QAZIPRO_CLEAR_METRO_CACHE === "true") args.push("--clear");
const child = spawn(
  process.execPath,
  [expoCli, ...args],
  { stdio: "inherit", shell: false },
);
child.on("error", (error) => {
  console.error(`Operations export could not start: ${error.message}`);
  process.exit(1);
});
child.on("exit", (code, signal) => process.exit(signal ? 1 : (code ?? 1)));
