import { spawnSync } from "node:child_process";
import { fileURLToPath } from "node:url";

const projectId = "4a23a47a-09f1-4794-9d40-8024e55214ce";
const projectSlug = "italian-pizza-platform";
const commands = {
  project: ["project:info"],
  apk: ["build", "--platform", "android", "--profile", "operations-staging"],
  aab: ["build", "--platform", "android", "--profile", "operations-staging-aab"],
  device: ["device:create"],
  "ios-internal": ["build", "--platform", "ios", "--profile", "operations-ios-internal"],
  "ios-testflight": ["build", "--platform", "ios", "--profile", "operations-ios-testflight"],
  "submit-android": ["submit", "--platform", "android", "--profile", "operations-android-play"],
  "submit-ios": ["submit", "--platform", "ios", "--profile", "operations-ios-testflight"],
};

const command = commands[process.argv[2]];
if (!command) {
  console.error(`Unknown Operations EAS action: ${process.argv[2] ?? "missing"}`);
  process.exit(2);
}

const executable = process.platform === "win32" ? process.env.ComSpec ?? "cmd.exe" : "npx";
const args = process.platform === "win32"
  ? ["/d", "/s", "/c", "npx", "eas-cli@latest", ...command]
  : ["eas-cli@latest", ...command];
const result = spawnSync(executable, args, {
  cwd: fileURLToPath(new URL("..", import.meta.url)),
  env: {
    ...process.env,
    EAS_PROJECT_ID: projectId,
    MOBILE_APP_VARIANT: "operations",
    MOBILE_APP_SLUG: projectSlug,
    EXPO_PUBLIC_MOBILE_SURFACE: "operations",
    EXPO_PUBLIC_MOBILE_ROLE_HINT: "auto",
    EXPO_PUBLIC_APP_ENV: "staging",
  },
  stdio: "inherit",
});

if (result.error) throw result.error;
process.exit(result.status ?? 1);
