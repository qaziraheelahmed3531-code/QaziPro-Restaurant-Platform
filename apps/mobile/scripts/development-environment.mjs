import fs from "node:fs"
import os from "node:os"
import path from "node:path"
import { fileURLToPath } from "node:url"

const scriptDirectory = path.dirname(fileURLToPath(import.meta.url))
const customerEnvironment = path.resolve(
  scriptDirectory,
  "../../customer/.env.local",
)
const mobileEnvironment = path.resolve(scriptDirectory, "../.env.local")

function parseEnvironment(file) {
  if (!fs.existsSync(file)) return {}
  return Object.fromEntries(
    fs
      .readFileSync(file, "utf8")
      .split(/\r?\n/)
      .map((line) => line.trim())
      .filter((line) => line && !line.startsWith("#") && line.includes("="))
      .map((line) => {
        const separator = line.indexOf("=")
        const name = line.slice(0, separator).trim()
        let value = line.slice(separator + 1).trim()
        if (
          (value.startsWith('"') && value.endsWith('"')) ||
          (value.startsWith("'") && value.endsWith("'"))
        )
          value = value.slice(1, -1)
        return [name, value]
      }),
  )
}

function lanAddress() {
  for (const entries of Object.values(os.networkInterfaces()))
    for (const entry of entries ?? [])
      if (entry.family === "IPv4" && !entry.internal) return entry.address
  return "localhost"
}

export function prepareDevelopmentEnvironment(target) {
  const customer = parseEnvironment(customerEnvironment)
  const mobile = parseEnvironment(mobileEnvironment)
  const setDefault = (name, value) => {
    if (!process.env[name] && (mobile[name] || value))
      process.env[name] = mobile[name] || value
  }

  setDefault("EXPO_PUBLIC_APP_ENV", "development")
  setDefault(
    "EXPO_PUBLIC_SUPABASE_URL",
    customer.NEXT_PUBLIC_SUPABASE_URL,
  )
  setDefault(
    "EXPO_PUBLIC_SUPABASE_PUBLISHABLE_KEY",
    customer.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY,
  )
  setDefault("EXPO_PUBLIC_RESTAURANT_KEY", "italian-pizza")
  setDefault("EXPO_PUBLIC_ENABLE_PUSH", "false")

  const host =
    target === "web"
      ? "localhost"
      : target === "android" &&
          process.env.QAZIPRO_ANDROID_EMULATOR === "true"
        ? "10.0.2.2"
        : target === "ios" && process.platform === "darwin"
          ? "localhost"
          : lanAddress()
  setDefault("EXPO_PUBLIC_API_BASE_URL", `http://${host}:3000/api/v1`)

  const required = [
    "EXPO_PUBLIC_API_BASE_URL",
    "EXPO_PUBLIC_SUPABASE_URL",
    "EXPO_PUBLIC_SUPABASE_PUBLISHABLE_KEY",
    "EXPO_PUBLIC_RESTAURANT_KEY",
  ]
  const missing = required.filter((name) => !process.env[name]?.trim())
  if (missing.length) {
    console.error(
      `Mobile development configuration is missing: ${missing.join(", ")}. Configure apps/customer/.env.local or apps/mobile/.env.local.`,
    )
    process.exit(1)
  }
}
