import { describe, expect, it } from "vitest"
import { mutationErrorMessage } from "./mutation-result"

describe("safe inline mutation errors", () => {
  it("explains package dependency and branch safety failures", () => {
    expect(mutationErrorMessage("/packages?error=in-use")).toContain("current subscribers")
    expect(mutationErrorMessage("/branches?error=last-active")).toContain("at least one active branch")
  })
  it("explains delivery uncertainty without encouraging duplicate invites", () => {
    expect(mutationErrorMessage("/restaurants/123?error=invite-in-progress")).toContain("do not send it again")
  })
  it.each(["/tasks?error=SECRET_DATABASE_VALUE", "http://[", "/tasks?other=secret"])("never reflects unknown input: %s", value => {
    expect(mutationErrorMessage(value)).toContain("Your entries are preserved")
    expect(mutationErrorMessage(value)).not.toContain("SECRET_DATABASE_VALUE")
  })
})
