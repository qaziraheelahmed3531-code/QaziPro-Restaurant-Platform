import { describe, expect, it } from "vitest"
import { onboardingFieldMessage, validateProvisioningRequiredFields } from "./onboarding"

const valid = {
  name: "QaziPro QA Restaurant",
  ownerName: "QA Owner",
  ownerEmail: "owner@example.test",
  city: "Islamabad",
  packageId: "00000000-0000-4000-8000-000000000001",
  branchNames: ["Main Branch"],
  branchCodes: ["B1"],
}

describe("onboarding wizard validation", () => {
  it("requires package selection on the commercials step", () => {
    expect(validateProvisioningRequiredFields({ ...valid, packageId: "" })).toBe("Select an active service package before continuing.")
    expect(onboardingFieldMessage("packageId")).toBe("Select an active service package before continuing.")
  })

  it.each([
    ["name", { name: "Q" }, "restaurant brand name"],
    ["ownerName", { ownerName: "" }, "owner's name"],
    ["ownerEmail", { ownerEmail: "invalid" }, "valid owner email"],
    ["city", { city: "" }, "restaurant's city"],
    ["branchName", { branchNames: [""] }, "name for every branch"],
    ["branchCode", { branchCodes: [] }, "code for every branch"],
  ])("rejects the hidden required %s field when missing", (_field, patch, expected) => {
    expect(validateProvisioningRequiredFields({ ...valid, ...patch })).toContain(expected)
  })

  it("accepts a complete payload", () => {
    expect(validateProvisioningRequiredFields(valid)).toBeNull()
  })
})
