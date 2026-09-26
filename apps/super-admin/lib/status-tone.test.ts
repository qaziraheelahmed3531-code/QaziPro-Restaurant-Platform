import { describe, expect, it } from "vitest"
import { statusTone } from "./status-tone"
describe("honest status colors", () => {
  it.each(["INACTIVE", "DISCONNECTED", "NOT_READY", "DISABLED", "UNPUBLISHED"])("does not show %s as healthy", value => expect(statusTone(value)).toBe("neutral"))
  it.each(["UNVERIFIED", "UNKNOWN", "ANDROID: PENDING"])("shows uncertainty for %s", value => expect(statusTone(value)).toBe("warning"))
  it.each(["ACTIVE", "VERIFIED", "IOS: READY"])("recognizes %s", value => expect(statusTone(value)).toBe("success"))
})
