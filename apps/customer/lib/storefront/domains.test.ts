import { describe, expect, it } from "vitest"
import {
  isHostnameWithinPlatformDomain,
  normalizeHostname,
  normalizeRestaurantSlug,
  requestHostname,
  stagingHostnameForSlug,
} from "@italian-pizza/shared/domains"

describe("storefront hostname isolation", () => {
  it("normalizes case, ports, trailing dots and forwarded lists", () => {
    expect(normalizeHostname("Kings-Cafe.Staging.QaziPro.com:443")).toBe("kings-cafe.staging.qazipro.com")
    expect(normalizeHostname("kings-cafe.staging.qazipro.com., proxy.internal")).toBe("kings-cafe.staging.qazipro.com")
  })

  it("accepts a trusted wildcard forwarded host only behind the Vercel deployment host", () => {
    expect(requestHostname({
      host: "qazipro-restaurant-customer-staging.vercel.app",
      forwardedHost: "Kings-Cafe.Staging.QaziPro.com:443",
      platformDomain: "staging.qazipro.com",
    })).toBe("kings-cafe.staging.qazipro.com")
    expect(requestHostname({
      host: "kings-cafe.staging.qazipro.com",
      forwardedHost: "attacker.example",
      platformDomain: "staging.qazipro.com",
    })).toBe("kings-cafe.staging.qazipro.com")
  })

  it("builds canonical staging hostnames and rejects reserved slugs", () => {
    expect(normalizeRestaurantSlug("King's Cafe")).toBe("king-s-cafe")
    expect(stagingHostnameForSlug("kings-cafe", "staging.qazipro.com")).toBe("kings-cafe.staging.qazipro.com")
    expect(normalizeRestaurantSlug("admin")).toBe("")
  })

  it("does not treat the platform apex or a lookalike suffix as a tenant host", () => {
    expect(isHostnameWithinPlatformDomain("staging.qazipro.com", "staging.qazipro.com")).toBe(false)
    expect(isHostnameWithinPlatformDomain("kings-cafe.staging.qazipro.com.evil.test", "staging.qazipro.com")).toBe(false)
  })
})
