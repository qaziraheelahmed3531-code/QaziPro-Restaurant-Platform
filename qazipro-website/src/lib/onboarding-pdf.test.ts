import { describe,expect,it } from "vitest"
import { fallbackOnboardingDefinition } from "./onboarding"
import { createOnboardingPdf } from "./onboarding-pdf"

describe("onboarding PDF",()=>{
  it("generates a versioned PDF document",async()=>{
    const bytes=await createOnboardingPdf({reference:"QP-20261001-ABC123",formVersion:1,submittedAt:"2026-10-01T00:00:00.000Z",values:{restaurantName:"Test Restaurant",contactName:"Test Person",email:"test@example.com"},definition:fallbackOnboardingDefinition,serviceIds:["pos"],packageId:"custom",pricing:{currency:"PKR",monthly:0,setup:0,locationFee:0,hasQuotedPrice:false},signatureData:"data:image/png;base64,iVBORw0KGgo=",consentText:fallbackOnboardingDefinition.consentText})
    expect(new TextDecoder().decode(bytes.slice(0,5))).toBe("%PDF-")
    expect(bytes.length).toBeGreaterThan(1000)
  })
})
