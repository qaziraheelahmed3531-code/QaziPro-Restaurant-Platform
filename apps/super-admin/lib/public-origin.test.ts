import { describe, expect, it } from "vitest"
import { getPlatformAuthCallbackUrl, getPlatformPublicOrigin } from "./public-origin"

describe("Super Admin public origin", () => {
  it("uses the canonical Super Admin origin in staging", () => {
    expect(getPlatformPublicOrigin({
      APP_ENVIRONMENT: "staging",
      NODE_ENV: "production",
      PLATFORM_PUBLIC_URL: "http://localhost:3002",
    })).toBe("https://superadmin.qazipro.com")
  })

  it("never uses temporary Vercel or customer origins outside local development", () => {
    expect(getPlatformPublicOrigin({
      APP_ENVIRONMENT: "staging",
      NODE_ENV: "production",
      PLATFORM_PUBLIC_URL: "https://temporary-deployment.vercel.app",
    })).toBe("https://superadmin.qazipro.com")
    expect(getPlatformPublicOrigin({
      APP_ENVIRONMENT: "staging",
      NODE_ENV: "production",
      PLATFORM_PUBLIC_URL: "https://restaurant-a.staging.qazipro.com",
    })).toBe("https://superadmin.qazipro.com")
  })

  it("allows the configured local portal origin only in local development", () => {
    expect(getPlatformPublicOrigin({
      APP_ENVIRONMENT: "local",
      NODE_ENV: "development",
      PLATFORM_PUBLIC_URL: "http://localhost:4102/path",
    })).toBe("http://localhost:4102")
  })

  it("builds the canonical OAuth callback", () => {
    expect(getPlatformAuthCallbackUrl({ APP_ENVIRONMENT: "staging", NODE_ENV: "production" }))
      .toBe("https://superadmin.qazipro.com/auth/callback")
  })
})

