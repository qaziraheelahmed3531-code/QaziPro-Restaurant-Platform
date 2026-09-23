import { describe, expect, it } from "vitest"
import { canBootstrapPlatformOwner } from "./owner-bootstrap"

const email = "qaziraheelahmed3531@gmail.com"
const googleUser = {
  email,
  email_confirmed_at: "2026-09-21T00:00:00Z",
  identities: [{ provider: "google", identity_data: { email, email_verified: true } }],
}

describe("initial platform owner bootstrap", () => {
  it("accepts only the allowlisted verified Google identity", () => {
    expect(canBootstrapPlatformOwner(googleUser, email)).toBe(true)
  })
  it("denies email-only and password identities", () => {
    expect(canBootstrapPlatformOwner({ ...googleUser, identities: [] }, email)).toBe(false)
    expect(canBootstrapPlatformOwner({ ...googleUser, identities: [{ provider: "email", identity_data: { email, email_verified: true } }] }, email)).toBe(false)
  })
  it("denies unverified or different Google accounts", () => {
    expect(canBootstrapPlatformOwner({ ...googleUser, email_confirmed_at: null }, email)).toBe(false)
    expect(canBootstrapPlatformOwner({ ...googleUser, identities: [{ provider: "google", identity_data: { email, email_verified: false } }] }, email)).toBe(false)
    expect(canBootstrapPlatformOwner(googleUser, "someone-else@gmail.com")).toBe(false)
  })
})
