import { spawn, spawnSync } from "node:child_process"
import { createRequire } from "node:module"
import { prepareDevelopmentEnvironment } from "./development-environment.mjs"

const target = process.argv[2] || "start"
if (!new Set(["start", "web", "android", "ios"]).has(target)) {
  console.error("Expected start, web, android or ios.")
  process.exit(1)
}

const onWindows = process.platform === "win32"
const hasAdb =
  !onWindows ||
  spawnSync("where.exe", ["adb"], { stdio: "ignore" }).status === 0
const canOpenNative =
  target === "ios"
    ? process.platform === "darwin"
    : target === "android"
      ? hasAdb
      : false

prepareDevelopmentEnvironment(target)

const args = [
  "start",
  ...(target === "web"
    ? ["--web"]
    : target === "android" || target === "ios"
      ? canOpenNative
        ? [`--${target}`]
        : []
      : []),
  ...process.argv.slice(3),
]

if ((target === "android" || target === "ios") && !canOpenNative) {
  console.log(
    target === "ios"
      ? "iOS Simulator requires macOS/Xcode. Expo QR mode started for a physical iPhone."
      : "Android SDK/adb was not found. Expo QR mode started for a physical Android phone.",
  )
}

if (process.env.QAZIPRO_MOBILE_START_DRY_RUN === "true") {
  console.log(`expo ${args.join(" ")}`)
  process.exit(0)
}

const require = createRequire(import.meta.url)
const expoCli = require.resolve("expo/bin/cli")
const child = spawn(process.execPath, [expoCli, ...args], {
  stdio: "inherit",
  shell: false,
})
child.on("error", (error) => {
  console.error(`Expo could not start: ${error.message}`)
  process.exit(1)
})
child.on("exit", (code, signal) => process.exit(signal ? 1 : (code ?? 1)))
