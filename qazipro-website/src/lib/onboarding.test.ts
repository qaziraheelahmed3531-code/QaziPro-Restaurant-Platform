import { describe, expect, it } from "vitest"
import { calculatePricing, fallbackOnboardingDefinition, onboardingDefinitionSchema } from "./onboarding"

describe("public onboarding contract", () => {
  it("accepts the safe fallback definition", () => {
    expect(onboardingDefinitionSchema.safeParse(fallbackOnboardingDefinition).success).toBe(true)
  })

  it("calculates configured fees on the server model", () => {
    const definition = structuredClone(fallbackOnboardingDefinition)
    definition.packages = [{ ...definition.packages[0], monthlyFee: 5000, setupFee: 2000, perLocationFee: 500 }]
    definition.services[0] = { ...definition.services[0], monthlyFee: 1000, setupFee: 250, perLocationFee: 100 }
    expect(calculatePricing(definition,"custom",["online-ordering"],3)).toEqual({ currency:"PKR",monthly:6000,setup:2250,locationFee:1800,hasQuotedPrice:true })
  })

  it("keeps unset pricing as a custom quote", () => {
    expect(calculatePricing(fallbackOnboardingDefinition,"custom",["pos"],2).hasQuotedPrice).toBe(false)
  })
})
