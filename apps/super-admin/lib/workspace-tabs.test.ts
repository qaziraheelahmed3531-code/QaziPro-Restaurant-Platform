import { describe, it, expect } from "vitest"
import { resolveWorkspaceTab, workspaceTabs } from "./workspace-tabs"
describe("restaurant workspace navigation", () => {
  it.each(workspaceTabs)("selects %s", tab => expect(resolveWorkspaceTab({tab})).toBe(tab))
  it("fails unknown navigation back to overview", () => expect(resolveWorkspaceTab({tab:"../../other"})).toBe("overview"))
  it.each([["invite","access"],["membership","access"],["branch","branches"],["branchStatus","branches"],["entitlement","services"]] as const)("preserves mutation context for %s", (key,expected) => expect(resolveWorkspaceTab({[key]:"updated"})).toBe(expected))
})
