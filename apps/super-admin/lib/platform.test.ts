import { describe, expect, it } from "vitest"
import { canTransitionRestaurant, effectivePermissions, healthFromSignals, slugifyRestaurant } from "./platform"

describe("platform authorization and lifecycle", () => {
  it("applies direct permission denies after role permissions", () => {
    expect(effectivePermissions(["restaurants.view", "billing.view"], { "billing.view": false, "audit.view": true }))
      .toEqual(["audit.view", "restaurants.view"])
  })

  it("rejects lifecycle stage skipping", () => {
    expect(canTransitionRestaurant("CONFIGURATION", "ACTIVE")).toBe(false)
    expect(canTransitionRestaurant("READY", "ACTIVE")).toBe(true)
    expect(canTransitionRestaurant("ACTIVE", "ARCHIVED")).toBe(false)
  })

  it("never reports healthy when a signal is unknown", () => {
    expect(healthFromSignals(["HEALTHY", "UNKNOWN"])).toBe("UNKNOWN")
    expect(healthFromSignals(["UNKNOWN", "CRITICAL"])).toBe("CRITICAL")
  })

  it("creates stable public restaurant keys", () => {
    expect(slugifyRestaurant("  KING'S Cafe Islamabad  ")).toBe("king-s-cafe-islamabad")
  })

  it("grants an explicit direct permission", () => {
    expect(effectivePermissions([], { "support.access": true })).toEqual(["support.access"])
  })

  it("keeps permission output deterministic and unique", () => {
    expect(effectivePermissions(["restaurants.view", "restaurants.view", "audit.view"], {})).toEqual(["audit.view", "restaurants.view"])
  })

  it("allows suspension and controlled restoration", () => {
    expect(canTransitionRestaurant("ACTIVE", "SUSPENDED")).toBe(true)
    expect(canTransitionRestaurant("SUSPENDED", "ACTIVE")).toBe(true)
  })

  it("makes archived restaurants terminal", () => {
    expect(canTransitionRestaurant("ARCHIVED", "ACTIVE")).toBe(false)
    expect(canTransitionRestaurant("ARCHIVED", "LEAD")).toBe(false)
  })

  it("prioritizes warning over healthy signals", () => {
    expect(healthFromSignals(["HEALTHY", "WARNING"])).toBe("WARNING")
  })

  it("uses unknown for an empty health signal set", () => {
    expect(healthFromSignals([])).toBe("UNKNOWN")
  })

  it("normalizes repeated separators in public keys", () => {
    expect(slugifyRestaurant("Pizza  &  Grill---Lahore")).toBe("pizza-grill-lahore")
  })

  it("bounds public keys to a DNS-safe label length", () => {
    expect(slugifyRestaurant("a".repeat(90))).toHaveLength(63)
  })
})
