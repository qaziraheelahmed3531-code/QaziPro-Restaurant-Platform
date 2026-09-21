import { spawn, spawnSync } from "node:child_process"
import { createRequire } from "node:module"

const platform = process.argv[2]
if (!new Set(["android", "ios"]).has(platform)) {
  console.error("Expected android or ios.")
  process.exit(1)
}

const onWindows = process.platform === "win32"
const hasAdb = !onWindows || spawnSync("where.exe", ["adb"], { stdio: "ignore" }).status === 0
const canOpenNative = platform === "ios" ? process.platform === "darwin" : hasAdb
const args = ["start", ...(canOpenNative ? [`--${platform}`] : [])]

if (!canOpenNative) {
  if (platform === "ios") {
    console.log("iOS Simulator requires macOS/Xcode. Starting Expo QR mode for an eligible physical iPhone or development build instead.")
  } else {
    console.log("Android SDK/adb was not found. Starting Expo QR mode; use Expo Go/development build on a phone, or install Android Studio and set ANDROID_HOME for emulator launch.")
  }
}

if (process.env.QAZIPRO_MOBILE_START_DRY_RUN === "true") {
  console.log(`expo ${args.join(" ")}`)
  process.exit(0)
}

const require = createRequire(import.meta.url)
const expoCli = require.resolve("expo/bin/cli")
const child = spawn(process.execPath, [expoCli, ...args], { stdio: "inherit", shell: false })
child.on("error", (error) => {
  console.error(`Expo could not start: ${error.message}`)
  process.exit(1)
})
child.on("exit", (code, signal) => process.exit(signal ? 1 : (code ?? 1)))
